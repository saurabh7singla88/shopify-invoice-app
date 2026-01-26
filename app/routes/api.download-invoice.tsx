import type { ActionFunctionArgs } from "react-router";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "";
const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    let s3Key: string;

    // Handle both JSON and form data
    const contentType = request.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      const body = await request.json();
      s3Key = body.s3Key;
    } else if (contentType?.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      s3Key = formData.get("s3Key") as string;
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported content type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!s3Key) {
      return new Response(
        JSON.stringify({ error: "s3Key is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Downloading invoice from S3: ${S3_BUCKET_NAME}/${s3Key}`);

    // Fetch from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key
    });

    const response = await s3Client.send(command);

    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Extract filename from s3Key
    const filename = s3Key.split('/').pop() || 'invoice.pdf';

    // Return PDF as response
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });

  } catch (error: any) {
    console.error("Error downloading invoice:", error);

    if (error.name === "NoSuchKey") {
      return new Response(
        JSON.stringify({ error: "Invoice file not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: error.message || "Failed to download invoice" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
