import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

// Use the same bucket as the app's static assets (CloudFormation AssetsBucket)
const BUCKET_NAME = process.env.S3_BUCKET_NAME || "shopify-invoice-app-assets-442327347395";

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
