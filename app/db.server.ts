import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB client for AWS serverless architecture
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
});

const dynamodb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertClassInstanceToMap: true, // Convert Date objects and other class instances
    removeUndefinedValues: true, // Remove undefined values
  },
});

export default dynamodb;

// Re-export helper functions
export { getShopBillingPlan } from "./services/dynamodb.server";
