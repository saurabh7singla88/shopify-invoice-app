import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

// Bucket for storing uploaded images (logos, signatures)
// This should be set via Lambda environment variable S3_BUCKET_NAME
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "";

if (!BUCKET_NAME) {
  console.error("S3_BUCKET_NAME environment variable is not set");
}

/**
 * Upload an image file to S3
 * @param file - File buffer
 * @param filename - Original filename
 * @param shop - Shop domain for organizing files
 * @returns S3 key/path
 */
export async function uploadImageToS3(file: Buffer, filename: string, shop: string): Promise<string> {
  const sanitizedShop = shop.replace(/[^a-zA-Z0-9-]/g, '-');
  const timestamp = Date.now();
  const extension = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const key = `shops/${sanitizedShop}/${timestamp}-${filename}`;
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: getContentType(extension),
  };
  
  await s3Client.send(new PutObjectCommand(uploadParams));
  console.log(`Image uploaded to S3: ${key}`);
  
  return key;
}

function getContentType(extension: string): string {
  const types: { [key: string]: string } = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  return types[extension] || 'application/octet-stream';
}

/**
 * Archive webhook payload to S3 for data loss prevention
 * Stores in: shops/{shop}/webhook_requests/{year}/{month}/{day}/{topic}/{orderId}-{orderName}-{timestamp}.json
 * 
 * Date-based folder structure for easy archival and cleanup.
 * Includes timestamp to preserve historical changes (multiple updates to same order).
 * 
 * @param shop - Shop domain
 * @param topic - Webhook topic (e.g., "orders/create")
 * @param payload - Webhook payload object
 * @param orderName - Optional order name for filename
 * @returns S3 key/path
 */
export async function archiveWebhookPayload(
  shop: string,
  topic: string,
  payload: any,
  orderName?: string
): Promise<string> {
  try {
    const sanitizedShop = shop.replace(/[^a-zA-Z0-9-]/g, '-');
    const sanitizedTopic = topic.replace(/\//g, '-'); // orders/create -> orders-create
    
    // Date-based folder structure
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Use order ID + timestamp for uniqueness (preserves all webhook events)
    const orderId = payload.id || payload.order_id || payload.shop_id || 'unknown';
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const orderSuffix = orderName ? `-${orderName.replace('#', '')}` : '';
    
    const key = `shops/${sanitizedShop}/webhook_requests/${year}/${month}/${day}/${sanitizedTopic}/${orderId}${orderSuffix}-${timestamp}.json`;
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'shop': shop,
        'topic': topic,
        'order-id': String(orderId),
        'archived-at': timestamp,
        'archive-date': `${year}-${month}-${day}`,
      },
    };
    
    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`[Webhook Archive] ✅ Archived to S3: ${key}`);
    
    return key;
  } catch (error) {
    console.error(`[Webhook Archive] ❌ Failed to archive:`, error);
    // CRITICAL: Never throw - webhook processing must continue even if S3 fails
    return '';
  }
}
