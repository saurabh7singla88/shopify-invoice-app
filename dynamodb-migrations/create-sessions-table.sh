#!/bin/bash
# Create DynamoDB table for Shopify session storage
# Run this script to set up the required DynamoDB table

TABLE_NAME="${DYNAMODB_SESSION_TABLE:-shopify_sessions}"
REGION="${AWS_REGION:-us-east-1}"

echo "Creating DynamoDB table: $TABLE_NAME in region: $REGION"

aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=id,AttributeType=S \
    AttributeName=shop,AttributeType=S \
  --key-schema \
    AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    "IndexName=shop_index,KeySchema=[{AttributeName=shop,KeyType=HASH}],Projection={ProjectionType=ALL}" \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"

echo "Table creation initiated. Waiting for table to be active..."

aws dynamodb wait table-exists \
  --table-name "$TABLE_NAME" \
  --region "$REGION"

echo "Table $TABLE_NAME is now active!"
