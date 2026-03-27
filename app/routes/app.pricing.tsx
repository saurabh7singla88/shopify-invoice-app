/**
 * Pricing & Plans Page
 * Display pricing plans and allow merchants to subscribe
 */

import { useState, useEffect, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb, { getShopBillingPlan } from "../db.server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import { isBillingTestMode, isManagedPricingMode } from "../utils/billing-helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  // Plan names must match Partner Dashboard exactly.
  // Managed Pricing: single lowercase name per tier ("basic", "premium", "advanced").
  // Billing API mode: separate monthly/annual plan names ("Basic Monthly", "Basic Annual", ...).
  const managedMode = isManagedPricingMode();
  const checkParams = {
    plans: managedMode
      ? ["basic", "premium", "advanced", "free"]
      : ["Basic Monthly", "Basic Annual", "Premium Monthly", "Premium Annual", "Advanced Monthly", "Advanced Annual"],
    isTest: isBillingTestMode(),
  };
  console.log("[Billing][check] → POST", `https://${session.shop}/admin/api/graphql.json`);
  console.log("[Billing][check] params:", JSON.stringify(checkParams));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const billingCheck = await (billing.check as any)(checkParams);

  console.log("[Billing][check] ← response:", JSON.stringify({
    appSubscriptions: billingCheck.appSubscriptions,
  }));

  let currentPlan = "Free";
  let currentPlanDetails = null;

  if (billingCheck.appSubscriptions.length > 0) {
    const subscription = billingCheck.appSubscriptions[0];
    currentPlan = subscription.name;
    currentPlanDetails = {
      name: subscription.name,
      status: subscription.status,
      test: subscription.test,
    };
  }

  // Update billing plan in Shops table
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop: session.shop },
      UpdateExpression: "SET billingPlan = :plan, updatedAt = :now",
      ExpressionAttributeValues: {
        ":plan": currentPlan,
        ":now": Date.now(),
      },
    }));
  } catch (error) {
    console.error("Error updating billing plan in Shops table:", error);
  }

  return {
    currentPlan,
    currentPlanDetails,
    // ── Billing mode: "api" (Billing API) | "managed" (Shopify Managed Pricing) ─────
    billingMode: process.env.BILLING_MODE || "api",
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  // ── Managed Pricing mode: no billing.request() — redirect to Shopify's plan page ──
  // This action should normally not be triggered in managed mode (the client navigates
  // directly), but this guard handles edge cases (e.g. JS disabled, direct POST).
  if (isManagedPricingMode()) {
    const shop = session.shop;
    const apiKey = process.env.SHOPIFY_API_KEY || "";
    return { managedPricingUrl: `https://${shop}/admin/charges/${apiKey}/pricing_plans` };
  }

  const formData = await request.formData();
  const plan = formData.get("plan") as string;
  const actionType = formData.get("action") as string;

  if (!plan) {
    return { error: "Plan parameter is required" };
  }

  // Handle cancel subscription
  if (actionType === "cancel") {
    try {
      await billing.cancel({
        subscriptionId: formData.get("subscriptionId") as string,
        isTest: isBillingTestMode(),
        prorate: true,
      });
      return { cancelled: true };
    } catch (error: any) {
      console.error("[Billing] Error cancelling subscription:", error);
      return { error: error?.message || "Failed to cancel subscription." };
    }
  }

  // billing.request() always THROWS — it never returns.
  // On success it throws a Response redirect (302) to Shopify's billing approval page.
  // On failure it throws a real Error.
  // We must catch the thrown Response, extract the Location URL, and return it
  // so the client can navigate window.top (required to escape the Shopify embedded iframe).
  // billing.request() always THROWS — it never returns.
  // For embedded apps with token exchange, it throws Response(401) with header:
  //   X-Shopify-API-Request-Failure-Reauthorize-Url: <billing-approval-url>
  // App Bridge's fetch interceptor sees this 401 and navigates to the billing page.
  // We must RE-THROW the Response so React Router passes it back to the client.
  try {
    const billingParams = {
      plan,
      isTest: isBillingTestMode(),
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing`,
    };
    console.log("[Billing][request] → POST Shopify Admin GraphQL appSubscriptionCreate");
    console.log("[Billing][request] params:", JSON.stringify(billingParams));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (billing.request as any)(billingParams);
    console.log("[Billing][request] ← returned (unexpected):", result);
    if (typeof result === "string") return { confirmationUrl: result };
    return {};
  } catch (error: any) {
    if (error instanceof Response) {
      const reauthUrl = error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
      const locationUrl = error.headers.get("Location");
      console.log("[Billing][request] ← threw Response:", {
        status: error.status,
        reauthUrl,
        locationUrl,
        allHeaders: Object.fromEntries(error.headers.entries()),
      });
      if (reauthUrl) {
        console.log("[Billing][request] ← confirmationUrl (reauth):", reauthUrl);
        return { confirmationUrl: reauthUrl };
      }
      if (locationUrl) {
        console.log("[Billing][request] ← confirmationUrl (location):", locationUrl);
        return { confirmationUrl: locationUrl };
      }
      throw error;
    }

    // Real error — parse Shopify userErrors for a friendly message
    const errorData: Array<{ field: string | null; message: string }> = error?.errorData || [];
    console.error("[Billing] Real error requesting subscription:", {
      message: error?.message,
      errorData: JSON.stringify(errorData),
    });

    // Detect common Shopify billing errors and surface actionable messages
    const shopifyMsg = errorData[0]?.message || "";
    let friendlyError = error?.message || "Failed to initiate billing. Please try again.";
    if (shopifyMsg.includes("public distribution")) {
      friendlyError = "Billing is not available for this app configuration. The app must be set to Public distribution in the Shopify Partner Dashboard before the Billing API can be used.";
    } else if (shopifyMsg.includes("Return URL")) {
      friendlyError = "Invalid return URL. Please check the SHOPIFY_APP_URL environment variable.";
    } else if (shopifyMsg.includes("already exists") || shopifyMsg.includes("active subscription")) {
      friendlyError = "An active subscription already exists for this store. Please cancel it before subscribing to a new plan.";
    } else if (shopifyMsg.length > 0) {
      friendlyError = shopifyMsg;
    }

    return {
      error: friendlyError,
    };
  }
};

export default function Pricing() {
  const { currentPlan, currentPlanDetails, billingMode, shop, apiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  // Tracks which plan button the user just clicked, for immediate loading feedback.
  // loadingPlan covers managed mode (window.top navigation — no form submission)
  // and API mode before navigation.state becomes "submitting".
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // ── Managed Pricing mode helpers ─────────────────────────────────────────────
  const isManagedMode = billingMode === "managed";
  // Direct URL to Shopify's hosted plan selection page
  const managedPricingUrl = isManagedMode
    ? `https://${shop}/admin/charges/${apiKey}/pricing_plans`
    : null;

  // Determine which plan is currently being submitted
  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";
  const submittingPlan = navigation.formData?.get("plan") as string | undefined;

  // Handle billing confirmation/managed pricing redirect.
  // Covers: confirmationUrl from Billing API mode, managedPricingUrl safety net from action.
  useEffect(() => {
    const data = actionData as any;
    const redirectUrl = data?.confirmationUrl || data?.managedPricingUrl;
    if (redirectUrl) {
      if (window.top) {
        window.top.location.href = redirectUrl;
      } else {
        window.location.href = redirectUrl;
      }
    }
  }, [actionData]);

  const handleSelectPlan = useCallback((planName: string) => {
    setLoadingPlan(planName);
    if (isManagedMode && managedPricingUrl) {
      // Managed Pricing: navigate directly — no server round trip needed
      if (window.top) {
        window.top.location.href = managedPricingUrl;
      } else {
        window.location.href = managedPricingUrl;
      }
      return;
    }
    // Billing API mode: submit form to trigger billing.request() on server
    const formData = new FormData();
    formData.append('plan', planName);
    submit(formData, { method: "post" });
  }, [isManagedMode, managedPricingUrl, submit]);

  const plans = [
    {
      id: "free",
      name: "Free",
      monthlyPrice: 0,
      annualPrice: 0,
      orderLimit: 50,
      features: [
        "Up to 50 orders/month",
        "Auto tax calculation",
        "1 default template",
      ],
      notIncluded: [
        "GSTR-1 & HSN (Ready to Submit) report",
        "Automatic HSN Code Sync",
        "Bulk download selected invoices",
        "Multiple templates",
        "Priority Support",
      ],
    },
    {
      id: "basic",
      name: "Basic",
      monthlyPrice: 7.99,
      annualPrice: 79.99,
      orderLimit: 250,
      features: [
        "Up to 250 orders/month",
        "Auto tax calculation",
        "GSTR-1 & HSN (Ready to Submit) report",
        "Automatic HSN Code Sync",
        "Bulk download selected invoices",
        "1 default template",
      ],
      notIncluded: [
        "Multiple templates",
        "Priority Support",
      ],
      // API mode plan names (billing.request needs exact name)
      planNames: {
        monthly: "Basic Monthly",
        annual: "Basic Annual",
      },
      // Managed Pricing mode plan name (matches Partner Dashboard exactly)
      managedPlanName: "basic",
    },
    {
      id: "premium",
      name: "Premium",
      monthlyPrice: 14.99,
      annualPrice: 149.99,
      orderLimit: 3000,
      features: [
        "Up to 3,000 orders/month",
        "Auto tax calculation",
        "GSTR-1 & HSN (Ready to Submit) report",
        "Automatic HSN Code Sync",
        "Bulk download selected invoices",
        "Multiple templates",
      ],
      notIncluded: [
        "Priority Support",
      ],
      popular: true,
      planNames: {
        monthly: "Premium Monthly",
        annual: "Premium Annual",
      },
      managedPlanName: "premium",
    },
    {
      id: "advanced",
      name: "Advanced",
      monthlyPrice: 39.99,
      annualPrice: 399.99,
      orderLimit: null,
      features: [
        "Unlimited orders/month",
        "Auto tax calculation",
        "GSTR-1 & HSN (Ready to Submit) report",
        "Automatic HSN Code Sync",
        "Bulk download selected invoices",
        "Multiple templates",
        "Priority Support",
      ],
      notIncluded: [],
      planNames: {
        monthly: "Advanced Monthly",
        annual: "Advanced Annual",
      },
      managedPlanName: "advanced",
    },
  ];

  // Case-insensitive comparison — works with both Billing API names ("Basic Monthly")
  // and Managed Pricing names ("basic").
  const isCurrentPlan = (planName?: string) => {
    if (!planName) return currentPlan.toLowerCase() === "free";
    return currentPlan.toLowerCase() === planName.toLowerCase();
  };

  return (
    <s-page heading="Pricing & Plans">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* Current plan banner */}
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: currentPlan === 'Free' ? '#f9fafb' : '#f0f9ff',
          border: `1px solid ${currentPlan === 'Free' ? '#e5e7eb' : '#bae6fd'}`,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>{currentPlan === 'Free' ? '📋' : '✓'}</span>
          <div>
            <div style={{ fontWeight: '600', color: currentPlan === 'Free' ? '#374151' : '#0c4a6e' }}>
              Current Plan: {currentPlan}
            </div>
            {currentPlanDetails && (
              <div style={{ fontSize: '13px', color: '#0369a1', marginTop: '4px' }}>
                {currentPlanDetails.status === 'ACTIVE' && !currentPlanDetails.test && 'Active subscription'}
                {currentPlanDetails.test && 'Test subscription (no charge)'}
              </div>
            )}
          </div>
        </div>

        {/* Managed Pricing mode info banner */}
        {isManagedMode && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#1e40af',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>🛒</span>
            <div>
              <strong>Managed by Shopify</strong>
              <div style={{ marginTop: '4px', lineHeight: '1.5' }}>
                Your subscription is managed directly through Shopify.
                Click any paid plan button to open Shopify's plan management page.
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {'error' in (actionData || {}) && (actionData as any)?.error && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '14px',
          }}>
            ⚠️ {(actionData as any).error}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '32px',
          gap: '8px',
          alignItems: 'center'
        }}>
          <button
            onClick={() => setBillingCycle("monthly")}
            style={{
              padding: '8px 16px',
              backgroundColor: billingCycle === "monthly" ? '#2563eb' : 'white',
              color: billingCycle === "monthly" ? 'white' : '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '6px 0 0 6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle("annual")}
            style={{
              padding: '8px 16px',
              backgroundColor: billingCycle === "annual" ? '#2563eb' : 'white',
              color: billingCycle === "annual" ? 'white' : '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '0 6px 6px 0',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Annual
          </button>
          <span style={{ marginLeft: '12px', color: '#059669', fontSize: '13px', fontWeight: 500 }}>
            Save up to 17% with annual billing
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
          marginBottom: '32px'
        }}>
          {plans.map((plan) => {
            const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
            // In managed mode use the single plan name; in API mode use monthly/annual variant
            const planName = isManagedMode
              ? (plan as any).managedPlanName as string | undefined
              : (plan.planNames ? plan.planNames[billingCycle] : undefined);
            const isCurrent = isCurrentPlan(planName);

            return (
              <div
                key={plan.id}
                style={{
                  backgroundColor: 'white',
                  border: plan.popular ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '24px',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    padding: '4px 16px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    Most Popular
                  </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                    {plan.name}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '32px', fontWeight: '700' }}>
                      ${price}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '14px' }}>
                      /{billingCycle === "monthly" ? "month" : "year"}
                    </span>
                  </div>
                  {billingCycle === "annual" && plan.monthlyPrice > 0 && (
                    <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>
                      Save ${(plan.monthlyPrice * 12 - plan.annualPrice).toFixed(2)}/year
                    </div>
                  )}
                </div>

                <div style={{
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  textAlign: 'center',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151'
                }}>
                  {plan.orderLimit ? `Up to ${plan.orderLimit.toLocaleString()} orders/month` : "Unlimited orders"}
                </div>

                <div style={{ flex: 1, marginBottom: '20px' }}>
                  {plan.features.map((feature, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '8px',
                      fontSize: '14px',
                      color: '#374151'
                    }}>
                      <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((feature, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      marginBottom: '8px',
                      fontSize: '14px',
                      color: '#9ca3af'
                    }}>
                      <span>✗</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {(() => {
                  const isThisLoading = loadingPlan === planName || (isSubmitting && submittingPlan === planName);
                  const isAnyLoading = loadingPlan !== null || isSubmitting;
                  return (
                    <button
                      onClick={() => planName && !isAnyLoading && !isCurrent && handleSelectPlan(planName)}
                      disabled={isCurrent || !planName || isAnyLoading}
                      style={{
                        padding: '12px',
                        backgroundColor: isCurrent
                          ? '#e5e7eb'
                          : isThisLoading
                            ? '#1d4ed8'
                            : plan.popular
                              ? '#2563eb'
                              : 'white',
                        color: isCurrent
                          ? '#6b7280'
                          : isThisLoading || plan.popular
                            ? 'white'
                            : '#2563eb',
                        border: plan.popular || isThisLoading ? 'none' : '2px solid #2563eb',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: isCurrent || !planName || isAnyLoading ? 'not-allowed' : 'pointer',
                        width: '100%',
                        opacity: isAnyLoading && !isThisLoading ? 0.5 : 1,
                        transition: 'background-color 0.15s ease, opacity 0.15s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      {isThisLoading && (
                        <span style={{
                          display: 'inline-block',
                          width: '14px',
                          height: '14px',
                          border: '2px solid rgba(255,255,255,0.4)',
                          borderTopColor: 'white',
                          borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                          flexShrink: 0,
                        }} />
                      )}
                      {isThisLoading
                        ? 'Redirecting to Shopify...'
                        : isCurrent
                          ? '✓ Current Plan'
                          : plan.id === 'free'
                            ? 'Free Forever'
                            : isManagedMode
                              ? 'Select Plan'
                              : 'Start 30-Day Free Trial'}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: '32px',
          padding: '16px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#78350f',
          lineHeight: '1.6'
        }}>
          <strong>💡 Good to know:</strong>
          <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
            <li>All paid plans include a 30-day free trial - no credit card required upfront.</li>
            <li>Cancel anytime during the trial period without being charged.</li>
            <li>Upgrade or downgrade your plan at any time.</li>
            <li>Charges are added directly to your Shopify invoice.</li>
          </ul>
        </div>
      </div>
    </s-page>
  );
}
