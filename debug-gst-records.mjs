/**
 * Debug script to check ShopifyOrderItems records
 * Usage: node debug-gst-records.mjs <shop-domain> <order-number>
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const shop = process.argv[2];
const orderNumber = process.argv[3];

if (!shop || !orderNumber) {
  console.error("Usage: node debug-gst-records.mjs <shop-domain> <order-number>");
  console.error("Example: node debug-gst-records.mjs myshop.myshopify.com #1067");
  process.exit(1);
}

console.log(`\nInitializing AWS DynamoDB client (region: us-east-1)...`);
const client = new DynamoDBClient({ region: "us-east-1" });
const dynamodb = DynamoDBDocumentClient.from(client);

console.log(`Querying ShopifyOrderItems for shop: ${shop}, order: ${orderNumber}\n`);

try {
  const result = await dynamodb.send(new QueryCommand({
    TableName: "ShopifyOrderItems",
    KeyConditionExpression: "shop = :shop AND begins_with(orderNumber_lineItemIdx, :orderNum)",
    ExpressionAttributeValues: {
      ":shop": shop,
      ":orderNum": `${orderNumber}#`
    }
  }));

  if (!result.Items || result.Items.length === 0) {
    console.log("\n❌ No records found!");
    process.exit(0);
  }

  console.log(`\n✅ Found ${result.Items.length} records\n`);
  console.log("=" .repeat(80));

  result.Items.forEach((item, idx) => {
    console.log(`\nRecord ${idx + 1}:`);
    console.log(`  Shop: ${item.shop}`);
    console.log(`  Order Number: ${item.orderNumber}`);
    console.log(`  Line Item Index: ${item.lineItemIdx}`);
    console.log(`  Product: ${item.productTitle}`);
    console.log(`  SKU: ${item.sku || "N/A"}`);
    console.log(`  \n  Customer Info:`);
    console.log(`    Name: ${item.customerName || "⚠️  MISSING"}`);
    console.log(`    State: ${item.customerState || "⚠️  MISSING"}`);
    console.log(`    State Code: ${item.customerStateCode || "N/A"}`);
    console.log(`    Place of Supply: ${item.placeOfSupply || "⚠️  MISSING"}`);
    console.log(`  \n  Invoice Info:`);
    console.log(`    Invoice ID: ${item.invoiceId || "⚠️  NOT YET SET"}`);
    console.log(`    Invoice Number: ${item.invoiceNumber || "N/A"}`);
    console.log(`    Invoice Date: ${item.invoiceDate || "N/A"}`);
    console.log(`  \n  Tax Info:`);
    console.log(`    HSN: ${item.hsn || "N/A"}`);
    console.log(`    Tax Rate: ${item.taxRate}%`);
    console.log(`    Taxable Value: ₹${item.taxableValue}`);
    console.log(`    CGST: ₹${item.cgst || 0}`);
    console.log(`    SGST: ₹${item.sgst || 0}`);
    console.log(`    IGST: ₹${item.igst || 0}`);
    console.log(`  \n  Audit Trail:`);
    console.log(`    Created: ${item.createdAt}`);
    console.log(`    Created By: ${item.createdBy}`);
    console.log(`    Updated: ${item.updatedAt || "Not updated"}`);
    console.log(`    Updated By: ${item.updatedBy || "N/A"}`);
    console.log(`    Status: ${item.status}`);
    console.log("=" .repeat(80));
  });

  // Check for missing critical fields
  const missingFields = result.Items.filter(item => 
    !item.customerName || !item.customerState || !item.placeOfSupply
  );

  if (missingFields.length > 0) {
    console.log(`\n⚠️  WARNING: ${missingFields.length} records have missing customer info!`);
  }

} catch (error) {
  console.error("\n❌ Error querying DynamoDB:");
  console.error("Message:", error.message);
  console.error("Code:", error.code || error.name);
  if (error.code === "CredentialsProviderError" || error.message.includes("credentials")) {
    console.error("\n💡 Hint: Make sure AWS credentials are configured (aws configure or environment variables)");
  }
  console.error("\nFull error:", error);
  process.exit(1);
}
