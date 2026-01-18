#!/bin/bash
# Build and Deploy Script for AWS Lambda + S3
# This script builds the React Router app and deploys it to AWS

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="production"
REGION="us-east-1"
BUCKET_NAME=""
FUNCTION_NAME="shopify-invoice-app"
SKIP_BUILD=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --bucket-name)
            BUCKET_NAME="$2"
            shift 2
            ;;
        --function-name)
            FUNCTION_NAME="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check required parameters
if [ -z "$BUCKET_NAME" ]; then
    echo -e "${RED}Error: --bucket-name parameter is required${NC}"
    echo "Usage: ./deploy.sh --bucket-name your-bucket-name [--function-name your-function-name] [--region us-east-1]"
    exit 1
fi

echo -e "${CYAN}Starting deployment process...${NC}"
echo -e "${CYAN}Environment: $ENVIRONMENT${NC}"
echo -e "${CYAN}Region: $REGION${NC}"
echo -e "${CYAN}S3 Bucket: $BUCKET_NAME${NC}"
echo -e "${CYAN}Lambda Function: $FUNCTION_NAME${NC}"

# Set environment
export NODE_ENV=$ENVIRONMENT

# Build the application
if [ "$SKIP_BUILD" = false ]; then
    echo -e "\n${CYAN}[1/6] Building React Router application...${NC}"
    npm run build
    echo -e "${GREEN}✓ Build completed successfully${NC}"
else
    echo -e "\n${CYAN}[1/6] Skipping build (using existing build)...${NC}"
fi

# Create deployment directory
echo -e "\n${CYAN}[2/6] Preparing deployment package...${NC}"
DEPLOY_DIR="./deploy-lambda"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy server build
cp -r ./build/server $DEPLOY_DIR/build/
cp ./server.lambda.mjs $DEPLOY_DIR/
cp ./package.json $DEPLOY_DIR/

# Install production dependencies
echo "Installing production dependencies..."
cd $DEPLOY_DIR
npm install --production --omit=dev
cd ..
echo -e "${GREEN}✓ Deployment package prepared${NC}"

# Deploy client assets to S3
echo -e "\n${CYAN}[3/6] Deploying client assets to S3...${NC}"
CLIENT_PATH="./build/client"
if [ -d "$CLIENT_PATH" ]; then
    # Upload static assets with long cache
    aws s3 sync $CLIENT_PATH s3://$BUCKET_NAME/assets/ \
        --region $REGION \
        --delete \
        --cache-control "public, max-age=31536000, immutable" \
        --exclude "*.html"
    
    # Upload HTML files with no-cache
    aws s3 sync $CLIENT_PATH s3://$BUCKET_NAME/assets/ \
        --region $REGION \
        --exclude "*" \
        --include "*.html" \
        --cache-control "public, max-age=0, must-revalidate"
    
    echo -e "${GREEN}✓ Client assets deployed to S3${NC}"
else
    echo -e "${RED}Client build not found at $CLIENT_PATH${NC}"
    exit 1
fi

# Create Lambda deployment package
echo -e "\n${CYAN}[4/6] Creating Lambda deployment package...${NC}"
cd $DEPLOY_DIR
ZIP_FILE="../lambda-deployment.zip"
rm -f $ZIP_FILE
zip -r $ZIP_FILE . -q
cd ..
ZIP_SIZE=$(du -h lambda-deployment.zip | cut -f1)
echo -e "${GREEN}✓ Lambda package created ($ZIP_SIZE)${NC}"

# Check if Lambda function exists
echo -e "\n${CYAN}[5/6] Checking Lambda function...${NC}"
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION &>/dev/null; then
    echo "Updating existing Lambda function..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://lambda-deployment.zip \
        --region $REGION
    echo -e "${GREEN}✓ Lambda function updated${NC}"
else
    echo "Lambda function does not exist. Please create it using CloudFormation template first."
    echo "Or use AWS CLI:"
    cat <<EOF
aws lambda create-function \\
  --function-name $FUNCTION_NAME \\
  --runtime nodejs20.x \\
  --role YOUR_LAMBDA_ROLE_ARN \\
  --handler server.lambda.lambdaHandler \\
  --zip-file fileb://lambda-deployment.zip \\
  --timeout 30 \\
  --memory-size 1024 \\
  --region $REGION \\
  --environment Variables="{NODE_ENV=$ENVIRONMENT,SHOPIFY_API_KEY=YOUR_KEY,SHOPIFY_API_SECRET=YOUR_SECRET,...}"
EOF
fi

# Cleanup
echo -e "\n${CYAN}[6/6] Cleaning up...${NC}"
rm -rf $DEPLOY_DIR
echo -e "${GREEN}✓ Cleanup completed${NC}"

echo -e "\n${GREEN}✨ Deployment process completed!${NC}"
echo -e "\n${CYAN}Next steps:${NC}"
echo "1. Configure API Gateway to point to your Lambda function"
echo "2. Set up CloudFront distribution for S3 assets"
echo "3. Update SHOPIFY_APP_URL environment variable"
echo "4. Test the deployment"
