import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { DynamoDBSessionStorageWrapper } from "./session-storage-wrapper";
import { TABLE_NAMES } from "./constants/tables";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: ["read_orders", "read_customers", "read_products"],
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new DynamoDBSessionStorageWrapper({
    sessionTableName: TABLE_NAMES.SESSIONS,
    shopIndexName: 'shop_index',
    config: {
      region: process.env.AWS_REGION || "us-east-1",
    },
  }),
  isEmbeddedApp: true,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  billing: {
    "Basic Monthly": {
      lineItems: [
        {
          amount: 7.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
      trialDays: 30,
    },
    "Basic Annual": {
      lineItems: [
        {
          amount: 79.99,
          currencyCode: "USD",
          interval: "ANNUAL",
        },
      ],
      trialDays: 30,
    },
    "Premium Monthly": {
      lineItems: [
        {
          amount: 14.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
      trialDays: 30,
    },
    "Premium Annual": {
      lineItems: [
        {
          amount: 149.99,
          currencyCode: "USD",
          interval: "ANNUAL",
        },
      ],
      trialDays: 30,
    },
    "Advanced Monthly": {
      lineItems: [
        {
          amount: 39.99,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
        },
      ],
      trialDays: 30,
    },
    "Advanced Annual": {
      lineItems: [
        {
          amount: 399.99,
          currencyCode: "USD",
          interval: "ANNUAL",
        },
      ],
      trialDays: 30,
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
