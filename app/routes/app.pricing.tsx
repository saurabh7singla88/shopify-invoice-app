/**
 * Pricing & Plans Page
 * Managed Pricing: shows current plan + redirects to Shopify's hosted plan page.
 * Billing API fallback: full plan selection with billing.request().
 */

import { useState, useEffect, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb, { getShopBillingPlan } from "../db.server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";
import { isBillingTestMode, isManagedPricingMode, getPlanTier } from "../utils/billing-helpers";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  const checkParams = {
    plans: ["Free", "Basic", "Premium", "Advanced", "Basic Monthly", "Basic Annual", "Premium Monthly", "Premium Annual", "Advanced Monthly", "Advanced Annual"],
    isTest: isBillingTestMode(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const billingCheck = await (billing.check as any)(checkParams);

  let currentPlan = "Free";
  let currentPlanDetails = null;

  if (billingCheck.appSubscriptions.length > 0) {
    const subscription = billingCheck.appSubscriptions[0];
    currentPlan = subscription.name;
    currentPlanDetails = {
      id: subscription.id,
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
    billingMode: process.env.BILLING_MODE || "api",
    shop: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

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

  try {
    const billingParams = {
      plan,
      isTest: isBillingTestMode(),
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing`,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (billing.request as any)(billingParams);
    if (typeof result === "string") return { confirmationUrl: result };
    return {};
  } catch (error: any) {
    if (error instanceof Response) {
      const reauthUrl = error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
      const locationUrl = error.headers.get("Location");
      if (reauthUrl) return { confirmationUrl: reauthUrl };
      if (locationUrl) return { confirmationUrl: locationUrl };
      throw error;
    }

    const errorData: Array<{ field: string | null; message: string }> = error?.errorData || [];
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

    return { error: friendlyError };
  }
};

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    orderLimit: "50 orders/month",
    features: [
      "Up to 50 orders/month",
      "Auto tax calculation",
      "1 default template",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    price: "$7.99/month",
    orderLimit: "250 orders/month",
    features: [
      "Up to 250 orders/month",
      "Auto tax calculation",
      "GSTR-1 & HSN (Ready to Submit) report",
      "Automatic HSN Code Sync",
      "Bulk download selected invoices",
      "1 default template",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$14.99/month",
    orderLimit: "3,000 orders/month",
    popular: true,
    features: [
      "Up to 3,000 orders/month",
      "Auto tax calculation",
      "GSTR-1 & HSN (Ready to Submit) report",
      "Automatic HSN Code Sync",
      "Bulk download selected invoices",
      "Multiple templates",
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    price: "$39.99/month",
    orderLimit: "Unlimited orders",
    features: [
      "Unlimited orders/month",
      "Auto tax calculation",
      "GSTR-1 & HSN (Ready to Submit) report",
      "Automatic HSN Code Sync",
      "Bulk download selected invoices",
      "Multiple templates",
      "Priority Support",
    ],
  },
];

export default function Pricing() {
  const { currentPlan, currentPlanDetails, billingMode, shop, apiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isManagedMode = billingMode === "managed";
  const managedPricingUrl = `https://${shop}/admin/charges/${apiKey}/pricing_plans`;
  const currentTier = getPlanTier(currentPlan);
  const isSubmitting = navigation.state === "submitting" || navigation.state === "loading";

  useEffect(() => {
    const data = actionData as any;
    if (data?.cancelled) {
      window.location.reload();
      return;
    }
    const redirectUrl = data?.confirmationUrl || data?.managedPricingUrl;
    if (redirectUrl) {
      if (window.top) {
        window.top.location.href = redirectUrl;
      } else {
        window.location.href = redirectUrl;
      }
    }
  }, [actionData]);

  const handleManagePlan = useCallback(() => {
    setIsRedirecting(true);
    if (window.top) {
      window.top.location.href = managedPricingUrl;
    } else {
      window.location.href = managedPricingUrl;
    }
  }, [managedPricingUrl]);

  // Managed Pricing mode — simple current plan display + redirect to Shopify
  if (isManagedMode) {
    const currentPlanData = plans.find(p => p.name.toLowerCase() === currentTier.toLowerCase()) || plans[0];

    return (
      <s-page heading="Pricing & Plans">
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

          {/* Current Plan Card */}
          <div style={{
            backgroundColor: 'white',
            border: '2px solid #2563eb',
            borderRadius: '12px',
            padding: '32px',
            marginBottom: '32px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  Current Plan
                </div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#111827', marginBottom: '4px' }}>
                  {currentTier}
                </div>
                <div style={{ fontSize: '15px', color: '#6b7280' }}>
                  {currentPlanData.price} &middot; {currentPlanData.orderLimit}
                </div>
                {currentPlanDetails && (
                  <div style={{ fontSize: '13px', color: '#2563eb', marginTop: '8px' }}>
                    {currentPlanDetails.status === 'ACTIVE' && !currentPlanDetails.test && 'Active subscription'}
                    {currentPlanDetails.test && 'Test subscription (no charge)'}
                  </div>
                )}
              </div>
              <button
                onClick={handleManagePlan}
                disabled={isRedirecting}
                style={{
                  padding: '12px 24px',
                  backgroundColor: isRedirecting ? '#93c5fd' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: isRedirecting ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isRedirecting ? 'Redirecting...' : 'Change Plan'}
              </button>
            </div>

            {/* Current plan features */}
            <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                Included in your plan:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                {currentPlanData.features.map((feature, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#374151' }}>
                    <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All Plans Comparison */}
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '16px' }}>
              Compare Plans
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}>
              {plans.map((plan) => {
                const isCurrent = plan.name.toLowerCase() === currentTier.toLowerCase();
                return (
                  <div
                    key={plan.id}
                    style={{
                      backgroundColor: 'white',
                      border: isCurrent ? '2px solid #2563eb' : '1px solid #e5e7eb',
                      borderRadius: '12px',
                      padding: '20px',
                      position: 'relative',
                      opacity: isCurrent ? 1 : 0.85,
                    }}
                  >
                    {isCurrent && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '12px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        padding: '2px 10px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        Current
                      </div>
                    )}
                    {plan.popular && !isCurrent && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '12px',
                        backgroundColor: '#6366f1',
                        color: 'white',
                        padding: '2px 10px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        Popular
                      </div>
                    )}
                    <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{plan.name}</div>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>{plan.price}</div>
                    <div style={{
                      padding: '8px',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px',
                      marginBottom: '12px',
                      textAlign: 'center',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#374151',
                    }}>
                      {plan.orderLimit}
                    </div>
                    {plan.features.map((feature, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        marginBottom: '6px',
                        fontSize: '13px',
                        color: '#374151',
                      }}>
                        <span style={{ color: '#059669', fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Change plan CTA */}
          <div style={{
            textAlign: 'center',
            padding: '24px',
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
          }}>
            <p style={{ fontSize: '15px', color: '#374151', marginBottom: '16px' }}>
              Want to upgrade, downgrade, or cancel? Manage your subscription directly through Shopify.
            </p>
            <button
              onClick={handleManagePlan}
              disabled={isRedirecting}
              style={{
                padding: '12px 32px',
                backgroundColor: isRedirecting ? '#93c5fd' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: isRedirecting ? 'not-allowed' : 'pointer',
              }}
            >
              {isRedirecting ? 'Redirecting...' : 'Manage Plan on Shopify'}
            </button>
          </div>

          <div style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#78350f',
            lineHeight: '1.6',
          }}>
            <strong>Good to know:</strong>
            <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
              <li>All paid plans include a 30-day free trial — no credit card required upfront.</li>
              <li>Cancel anytime during the trial period without being charged.</li>
              <li>Upgrade or downgrade your plan at any time from Shopify.</li>
              <li>Charges are added directly to your Shopify invoice.</li>
            </ul>
          </div>
        </div>
      </s-page>
    );
  }

  // Billing API mode — full plan selection (fallback for non-managed apps)
  return (
    <s-page heading="Pricing & Plans">
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ color: '#6b7280' }}>
            Current Plan: <strong>{currentTier}</strong>
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {plans.map((plan) => {
            const isCurrent = plan.name.toLowerCase() === currentTier.toLowerCase();
            return (
              <div
                key={plan.id}
                style={{
                  backgroundColor: 'white',
                  border: isCurrent ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>{plan.name}</div>
                <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>{plan.price}</div>
                <div style={{ flex: 1, marginBottom: '16px' }}>
                  {plan.features.map((feature, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '6px', fontSize: '13px', color: '#374151' }}>
                      <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (isCurrent || isSubmitting) return;
                    const formData = new FormData();
                    formData.append('plan', plan.id === 'free' ? 'free' : `${plan.name} Monthly`);
                    if (plan.id === 'free' && currentPlanDetails?.id) {
                      formData.append('action', 'cancel');
                      formData.append('subscriptionId', currentPlanDetails.id);
                    }
                    submit(formData, { method: "post" });
                  }}
                  disabled={isCurrent || isSubmitting}
                  style={{
                    padding: '10px',
                    backgroundColor: isCurrent ? '#e5e7eb' : '#2563eb',
                    color: isCurrent ? '#6b7280' : 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isCurrent || isSubmitting ? 'not-allowed' : 'pointer',
                    width: '100%',
                  }}
                >
                  {isCurrent ? '✓ Current Plan' : plan.id === 'free' ? 'Downgrade to Free' : 'Start Free Trial'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </s-page>
  );
}
