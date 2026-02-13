import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Form, useNavigation, useActionData } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopCompanyDetails, saveShopCompanyDetails } from "../services/dynamodb.server";
import { uploadImageToS3 } from "../services/s3.server";
import { INDIAN_STATES } from "../constants/indianStates";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  // Load existing company details from Shops table
  let companyDetails = null;
  try {
    companyDetails = await getShopCompanyDetails(shop);
  } catch (error) {
    console.error("Error loading company details:", error);
  }
  
  return { shop, companyDetails };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  
  const formData = await request.formData();
  
  // Get existing company details first
  let existingDetails = await getShopCompanyDetails(shop);
  if (!existingDetails) {
    existingDetails = {};
  }
  
  // Helper to get form value or fallback to existing/default
  const getFormValue = (key: string, fallback: any) => {
    const value = formData.get(key);
    if (value === null || value === undefined) return fallback;
    const strValue = value as string;
    return strValue.trim() === "" ? fallback : strValue;
  };
  
  // Handle file uploads
  let logoS3Key = existingDetails.logoFilename || "logo.JPG";
  let signatureS3Key = existingDetails.signatureFilename || "";
  
  // Check if signature should be included
  const includeSignature = formData.get("includeSignature") === "on";
  
  try {
    const logoFile = formData.get("logoFile") as File | null;
    if (logoFile && logoFile.size > 0) {
      const logoBuffer = Buffer.from(await logoFile.arrayBuffer());
      logoS3Key = await uploadImageToS3(logoBuffer, logoFile.name, shop);
      console.log(`Logo uploaded: ${logoS3Key}`);
    }
    
    // Only upload signature if includeSignature is checked
    if (includeSignature) {
      const signatureFile = formData.get("signatureFile") as File | null;
      if (signatureFile && signatureFile.size > 0) {
        const signatureBuffer = Buffer.from(await signatureFile.arrayBuffer());
        signatureS3Key = await uploadImageToS3(signatureBuffer, signatureFile.name, shop);
        console.log(`Signature uploaded: ${signatureS3Key}`);
      }
    } else {
      // If signature is disabled, set to null
      signatureS3Key = null;
    }
  } catch (uploadError) {
    console.error("Error uploading files:", uploadError);
    return { success: false, error: "Failed to upload images" };
  }
  
  // Build company details object
  const companyDetails = {
    companyName: getFormValue("companyName", existingDetails.companyName || ""),
    legalName: getFormValue("legalName", existingDetails.legalName || ""),
    addressLine1: getFormValue("addressLine1", existingDetails.addressLine1 || ""),
    addressLine2: getFormValue("addressLine2", existingDetails.addressLine2 || ""),
    city: getFormValue("city", existingDetails.city || ""),
    state: getFormValue("state", existingDetails.state || ""),
    pincode: getFormValue("pincode", existingDetails.pincode || ""),
    gstin: getFormValue("gstin", existingDetails.gstin || ""),
    supportEmail: getFormValue("supportEmail", existingDetails.supportEmail || ""),
    phone: getFormValue("phone", existingDetails.phone || ""),
    logoFilename: logoS3Key,
    includeSignature: includeSignature,
    signatureFilename: signatureS3Key,
    multiWarehouseGST: formData.get("multiWarehouseGST") === "on",
  };
  
  try {
    await saveShopCompanyDetails(shop, companyDetails);
    console.log(`✅ Company details saved for shop: ${shop}`);
    return { success: true, message: "Company details saved successfully" };
  } catch (error) {
    console.error("Error saving company details:", error);
    return { success: false, error: "Failed to save company details" };
  }
};

export default function CompanyDetails() {
  const { shop, companyDetails } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Company Details</h2>
      <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>
        Configure your company information that appears on invoices
      </p>

      {actionData?.success && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#d1fae5',
          border: '1px solid #6ee7b7',
          borderRadius: '6px',
          marginBottom: '24px',
          color: '#065f46',
          fontSize: '14px'
        }}>
          ✓ {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          marginBottom: '24px',
          color: '#991b1b',
          fontSize: '14px'
        }}>
          ✗ {actionData.error}
        </div>
      )}

      <Form method="post" encType="multipart/form-data">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', columnGap: '20px' }}>
          {/* Company Name */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Company Name
            </label>
            <input
              type="text"
              name="companyName"
              defaultValue={companyDetails?.companyName || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Legal Name */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Legal Name
            </label>
            <input
              type="text"
              name="legalName"
              defaultValue={companyDetails?.legalName || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Address Line 1 */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Address Line 1
            </label>
            <input
              type="text"
              name="addressLine1"
              defaultValue={companyDetails?.addressLine1 || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Address Line 2 */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Address Line 2
            </label>
            <input
              type="text"
              name="addressLine2"
              defaultValue={companyDetails?.addressLine2 || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* City */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              City
            </label>
            <input
              type="text"
              name="city"
              defaultValue={companyDetails?.city || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* State */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              State
            </label>
            <select
              name="state"
              defaultValue={companyDetails?.state || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              <option value="">Select State</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>

          {/* Pincode */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Pincode
            </label>
            <input
              type="text"
              name="pincode"
              defaultValue={companyDetails?.pincode || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* GSTIN */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              GSTIN
            </label>
            <input
              type="text"
              name="gstin"
              defaultValue={companyDetails?.gstin || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Support Email */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Support Email
            </label>
            <input
              type="email"
              name="supportEmail"
              defaultValue={companyDetails?.supportEmail || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Phone */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Phone
            </label>
            <input
              type="text"
              name="phone"
              defaultValue={companyDetails?.phone || ""}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Logo Upload */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Company Logo
            </label>
            <input
              type="file"
              name="logoFile"
              accept="image/*"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            {companyDetails?.logoFilename && (
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Current: {companyDetails.logoFilename}
              </p>
            )}
          </div>

          {/* Include Signature Checkbox */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                name="includeSignature"
                defaultChecked={companyDetails?.includeSignature !== undefined ? companyDetails?.includeSignature : true}
                style={{ width: '16px', height: '16px' }}
              />
              <span>Include Signature in Invoice</span>
            </label>
          </div>

          {/* Signature Upload */}
          <div style={{ gridColumn: '1 / -1', marginBottom: '4px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
              Signature Image
            </label>
            <input
              type="file"
              name="signatureFile"
              accept="image/*"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            {companyDetails?.signatureFilename && (
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Current: {companyDetails.signatureFilename}
              </p>
            )}
          </div>

          {/* Multi-Warehouse GST Checkbox */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'start', gap: '8px', fontSize: '14px' }}>
              <input
                type="checkbox"
                name="multiWarehouseGST"
                defaultChecked={companyDetails?.multiWarehouseGST || false}
                style={{ width: '16px', height: '16px', marginTop: '2px' }}
              />
              <div>
                <span style={{ fontWeight: '500' }}>Multi-Warehouse GST</span>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Enable if you fulfill orders from multiple warehouse locations in different states. 
                  When enabled, the GST invoice will be generated at the time of fulfillment (instead of order creation) 
                  so that the correct warehouse state is used for intra-state vs inter-state tax calculation (CGST+SGST vs IGST).
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '10px 24px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1
            }}
          >
            {isSubmitting ? 'Saving...' : 'Save Company Details'}
          </button>
        </div>
      </Form>
    </div>
  );
}
