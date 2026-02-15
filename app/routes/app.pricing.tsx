/**
 * Pricing & Plans Page
 * Display pricing plans and allow merchants to subscribe
 */

import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useActionData, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import dynamodb, { getShopBillingPlan } from "../db.server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  // Check current subscription status
  const billingCheck = await billing.check({
    plans: [
      "Basic Monthly", "Basic Annual",
      "Premium Monthly", "Premium Annual",
      "Advanced Monthly", "Advanced Annual"
    ],
    isTest: process.env.NODE_ENV !== "production",
  });

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

  return { currentPlan, currentPlanDetails };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = formData.get("plan") as string;

  if (!plan) {
    return { error: "Plan parameter is required" };
  }

  try {
    // Request billing approval from Shopify
    // Note: Billing API only works in production or with approved public apps
    const confirmationUrl = await billing.request({
      plan,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing`,
    });

    // Return the URL for client-side redirect
    return { confirmationUrl };
  } catch (error) {
    console.error("[Billing] Error requesting subscription:", error);
    return { 
      error: "Billing API not available in development mode. The billing API only works for published apps.",
    };
  }
};

export default function Pricing() {
  const { currentPlan, currentPlanDetails } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  // Handle billing confirmation redirect
  useEffect(() => {
    if (actionData && 'confirmationUrl' in actionData && actionData.confirmationUrl) {
      window.open(actionData.confirmationUrl, "_top");
    }
  }, [actionData]);

  const handleSelectPlan = (planName: string) => {
    const formData = new FormData();
    formData.append('plan', planName);
    submit(formData, { method: "post" });
  };

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
      planNames: {
        monthly: "Basic Monthly",
        annual: "Basic Annual",
      },
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
    },
  ];

  const isCurrentPlan = (planName?: string) => {
    if (!planName) return currentPlan === "Free";
    return currentPlan === planName;
  };

  return (
    <s-page heading="Pricing & Plans">
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {currentPlanDetails && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '24px' }}>✓</span>
            <div>
              <div style={{ fontWeight: '600', color: '#0c4a6e' }}>
                Current Plan: {currentPlan}
              </div>
              <div style={{ fontSize: '13px', color: '#0369a1', marginTop: '4px' }}>
                {currentPlanDetails.status === "ACTIVE" && !currentPlanDetails.test && "Active subscription"}
                {currentPlanDetails.test && "Test mode"}
              </div>
            </div>
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
            const planName = plan.planNames ? plan.planNames[billingCycle] : undefined;
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

                <button
                  onClick={() => planName && handleSelectPlan(planName)}
                  disabled={isCurrent || !planName}
                  style={{
                    padding: '12px',
                    backgroundColor: isCurrent ? '#e5e7eb' : plan.popular ? '#2563eb' : 'white',
                    color: isCurrent ? '#6b7280' : plan.popular ? 'white' : '#2563eb',
                    border: plan.popular ? 'none' : '2px solid #2563eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: isCurrent || !planName ? 'not-allowed' : 'pointer',
                    width: '100%',
                  }}
                >
                  {isCurrent ? 'Current Plan' : plan.id === 'free' ? 'Free Forever' : 'Start 30-Day Free Trial'}
                </button>
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
