/**
 * API Route: Tax Configuration Management
 * GET - Fetch current tax calculation method
 * POST - Update tax calculation method
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAMES } from "../constants/tables";

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop },
    }));

    const configurations = result.Item?.configurations
      ? (typeof result.Item.configurations === 'string'
        ? JSON.parse(result.Item.configurations)
        : result.Item.configurations)
      : {};

    return Response.json({
      taxCalculationMethod: configurations.taxCalculationMethod || "shopify"
    });
  } catch (error) {
    console.error("[Tax Config] Error fetching config:", error);
    return Response.json({ error: "Failed to load configuration" }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const body = await request.json();
    const { taxCalculationMethod } = body;

    if (!["app", "shopify"].includes(taxCalculationMethod)) {
      return Response.json({ error: "Invalid tax calculation method" }, { status: 400 });
    }

    // Fetch existing configurations
    const result = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop },
    }));

    const existingConfigurations = result.Item?.configurations
      ? (typeof result.Item.configurations === 'string'
        ? JSON.parse(result.Item.configurations)
        : result.Item.configurations)
      : {};

    // Merge with new config
    const updatedConfigurations = {
      ...existingConfigurations,
      taxCalculationMethod,
    };

    // Save to DynamoDB
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAMES.SHOPS,
      Key: { shop },
      UpdateExpression: "SET configurations = :config, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":config": updatedConfigurations,
        ":updatedAt": new Date().toISOString(),
      },
    }));

    console.log(`[Tax Config] Updated for shop ${shop}: ${taxCalculationMethod}`);

    return Response.json({ success: true, taxCalculationMethod });
  } catch (error) {
    console.error("[Tax Config] Error saving config:", error);
    return Response.json({ error: "Failed to save configuration" }, { status: 500 });
  }
};
