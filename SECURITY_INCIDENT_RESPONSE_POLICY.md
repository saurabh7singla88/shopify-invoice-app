# Security Incident Response Policy
**GSTGo - GST-Compliant Invoice Generator**

**Version:** 1.0  
**Effective Date:** February 16, 2026  
**Last Updated:** February 16, 2026  
**Document Owner:** Development Team

---

## 1. Overview

This Security Incident Response Policy outlines our approach to identifying, responding to, and recovering from security incidents that may affect the GSTGo application, its data, or our users. This policy represents our commitment to security best practices while aligning with **Shopify Partner Program requirements** and industry standards (NIST CSF, ISO 27001).

**Scope:** All systems, applications, data, and infrastructure related to the GSTGo Shopify app.

**Important Notice:** The timelines and procedures described in this policy represent target response times and best-effort commitments. Actual response times may vary based on incident complexity, resource availability, and circumstances beyond our reasonable control. This policy does not constitute a legally binding service level agreement (SLA).

**Compliance Framework:**
- Shopify Partner Program Policies
- Shopify App Store Security Requirements
- GDPR (EU General Data Protection Regulation)
- IT Act 2000 (Information Technology Act, India)
- CCPA (California Consumer Privacy Act)
- SOC 2 Type II principles (in progress)

---

## 2. Incident Classification

### Severity Levels

The following severity levels and target response times represent our commitment to security incident management. Actual response times may vary based on the specific circumstances of each incident.

**CRITICAL (P0) - Target Response Time: < 4 hours**
- Data breach potentially affecting customer PII or payment information
- Suspected unauthorized access to production systems or databases
- Complete service outage affecting all merchants
- Active exploitation of a critical vulnerability
- Suspected compromise of API keys, secrets, or credentials

**HIGH (P1) - Target Response Time: < 24 hours**
- Suspected unauthorized access attempt
- Potential data exposure of non-critical merchant data
- Partial service outage affecting multiple merchants
- Detection of suspected malware or suspicious code
- Apparent DDoS attack in progress

**MEDIUM (P2) - Target Response Time: < 3 business days**
- Suspicious activity patterns detected in logs
- Minor data inconsistency or corruption
- Performance degradation affecting user experience
- Vulnerability discovered through security scan
- Failed login attempts exceeding threshold

**LOW (P3) - Target Response Time: < 1 week**
- Policy violations (non-critical)
- Minor configuration issues
- Non-urgent security patches available
- Security awareness training opportunities

**Note:** Response times represent best-effort targets and assume reasonable availability of incident response personnel. For P0/P1 incidents occurring outside standard business hours, initial response may take up to 12 hours, with full containment efforts initiated within 24-48 hours, subject to the nature and complexity of the incident.

---

## 3. Incident Detection and Monitoring

### Automated Detection Systems

1. **AWS CloudWatch Logs**
   - Monitor all Lambda function errors and exceptions
   - Track failed authentication attempts (HMAC validation failures)
   - Alert on unusual API call patterns

2. **DynamoDB Monitoring**
   - Monitor for unauthorized data access patterns
   - Track failed queries and permission errors
   - Alert on unusual data modification volumes

3. **S3 Monitoring**
   - Track unauthorized access attempts
   - Monitor file modifications and deletions
   - Alert on unexpected data transfers

4. **Application Logs**
   - All webhook payloads archived to S3 (date-based structure)
   - All API requests logged with timestamps and IPs
   - Audit logs maintained for 90 days minimum

### Manual Detection
- Regular security audits (monthly)
- Penetration testing (quarterly)
- Code reviews for security vulnerabilities
- Dependency vulnerability scanning

---

## 4. Incident Response Procedures

The following procedures represent our planned approach to incident response. The specific actions taken during an actual incident will be tailored to the circumstances and may vary from these guidelines as deemed appropriate by incident response personnel.

### Step 1: Detection and Reporting (Target: 0-4 hours)

**Planned Actions:**
1. Identify incident through automated alerts or manual discovery
2. Document initial findings with timestamp and source
3. Assess and classify severity level (P0-P3)
4. Notify available incident response team members

**Incident Report Should Include:**
- Date and time of detection
- System/component believed to be affected
- Description of the suspected incident
- Preliminary impact assessment
- Initial severity classification

### Step 2: Containment (Target: 4-24 hours)

**Planned Actions for P0/P1 Incidents:**
1. **Isolate potentially affected systems**
   - Consider disabling compromised API keys/secrets
   - Evaluate credential rotation needs
   - Assess blocking suspicious IP addresses at API Gateway level
   - Evaluate whether to disable affected Lambda functions

2. **Preserve available evidence**
   - Attempt to capture CloudWatch log snapshots
   - Consider exporting relevant DynamoDB tables
   - Leverage S3 webhook archives
   - Document all actions taken

3. **Assess scope to the extent possible**
   - Attempt to identify affected merchants
   - Evaluate extent of potential data exposure
   - Check for signs of lateral movement or persistence

**Communication:**
- Notify Shopify Partner Support if merchant data appears to be affected (target: within 24 hours of confirmation)
- Prepare merchant communication as appropriate
- Document containment actions taken

### Step 3: Eradication (Target: 1-5 business days)

**Planned Remediation Actions:**
1. **Address identified threats**
   - Remove any confirmed malicious code or unauthorized access
   - Apply appropriate vulnerability patches
   - Remove confirmed malware or backdoors
   - Update firewall rules and security groups as needed

2. **Credential rotation (as warranted)**
   - Consider rotating API keys (SHOPIFY_API_SECRET, SHOPIFY_API_KEY)
   - Evaluate regenerating AWS access keys
   - Update database credentials if indicated
   - Invalidate potentially compromised sessions

3. **System hardening**
   - Apply relevant security patches
   - Update affected dependencies
   - Review and strengthen access controls
   - Review and update IAM policies as appropriate

### Step 4: Recovery (Target: 3-7 business days)

**Planned Recovery Activities:**
1. **Restore affected services**
   - Redeploy Lambda functions with updated code
   - Verify webhook subscriptions
   - Test critical functionality
   - Monitor for potential recurrence

2. **Data validation**
   - Verify data integrity to the extent possible
   - Consider restoring from backups if necessary
   - Validate invoice generation accuracy
   - Review GST calculation correctness

3. **Enhanced monitoring**
   - Consider increasing CloudWatch log retention temporarily
   - Evaluate additional alerts for similar incident patterns
   - Monitor potentially affected merchants

### Step 5: Post-Incident Review (Target: 2-3 weeks)

**Required Activities:**
1. **Root cause analysis**
   - Document timeline of events to the extent known
   - Attempt to identify vulnerability exploited
   - Consider improvements to detection capabilities
   - Assess response effectiveness

2. **Documentation**
   - Prepare incident report with lessons learned
   - Consider updates to runbooks and procedures
   - Document technical changes implemented
   - Archive evidence securely

3. **Preventive measures**
   - Evaluate additional security controls
   - Consider updates to security policies
   - Assess need for team training
   - Consider scheduling follow-up security review

---

## 5. Communication Protocols

### Internal Communication

**Incident Response Personnel:**
- Primary: Development Lead (available during business hours)
- Secondary: DevOps Engineer (subject to availability)
- Escalation: Technical Director

**Availability:**
- Business Hours: 9 AM - 6 PM IST (Monday-Friday)
- After Hours: Best-effort response via email/phone (target < 12 hours for P0/P1)
- Emergency: Direct phone contact for P0 incidents (subject to availability)

**Communication Channels:**
- Email: security@gstgo-app.com (monitored regularly)
- Slack: #security-incidents (checked during business hours)
- Phone: Emergency contact list (for critical incidents, subject to availability)

### External Communication

**Shopify Partner Support:**
- Partner Dashboard: https://partners.shopify.com/
- Report Security Incidents: partners@shopify.com
- Critical Security Issues: security@shopify.com
- **Target Notification Timeline**: Within 24 hours of discovery for any incident reasonably believed to affect merchant data (as required by Shopify Partner Program)

**Template for Shopify Notification:**
```
Subject: Security Incident Report - GSTGo App [Incident ID]

To: security@shopify.com, partners@shopify.com

App Name: GSTGo
App ID: [Your App ID]
Partner Organization: [Your Organization]

Incident Summary:
- Discovery Date/Time: [UTC timestamp]
- Incident Type: [Data breach / Unauthorized access / etc.]
- Severity: [Critical / High / Medium / Low]
- Affected Merchants: [Count and shop domains if known]
- Data Types Affected: [PII / Financial / Order data / etc.]

Immediate Actions Taken:
- [List containment measures]
- [Credential rotations performed]
- [Systems isolated]

Current Status:
- [Contained / Under investigation / Resolved]

Next Steps:
- [Remediation plan]
- [Merchant notification timeline]
- [Expected resolution date]

Contact: [Your name, email, phone]
```

**Affected Merchants:**
- Email notification via Shopify Admin API
- In-app banner notification
- Timeline: Within 72 hours of confirmed data breach
- Template: Pre-approved breach notification template

**Regulatory Notifications:**
- GDPR breaches: Endeavor to report to DPA within 72 hours as required by applicable law
- Indian CERT: Report as per IT Act requirements and timelines
- Format: Use standard incident notification templates where available

---
Shopify-Specific Security Controls

1. **Shopify OAuth 2.0 Implementation**
   - Token exchange authentication (unstable_newEmbeddedAuthStrategy)
   - Session-based access control
   - Automatic token refresh
   - Secure session storage in DynamoDB

2. **Webhook Security (Shopify Requirement)**
   - HMAC-SHA256 validation on all webhooks
   - Multi-secret support for zero-downtime rotation
   - Request origin validation
   - Replay attack prevention (timestamp validation)
   - All webhook payloads archived for audit (90+ days)

3. **Shopify API Best Practices**
   - Rate limiting compliance (40 requests/second)
   - GraphQL query cost management
   - Proper error handling and logging
   - API version management (stable versions only)

4. **Merchant Data Protection**
   - Never store customer payment information
   - PII encrypted at rest (DynamoDB, S3)
   - Minimal data collection principle
   - Data retention policies enforced (90-day TTL)
   - GDPR compliance webhooks implemented

### 
## 6. Data Breach Response

### If Customer/Merchant Data Potentially Compromised:

1. **Immediate Assessment and Actions (Target: 0-2 hours)**
   - Attempt to isolate potentially affected systems
   - Work to stop any ongoing data exfiltration
   - Preserve available forensic evidence
   - Conduct preliminary scope assessment

2. **Notification Timeline (Subject to Confirmation of Breach)**
   - Shopify: Target within 24 hours of reasonable confirmation
   - Affected merchants: Target within 72 hours as required by applicable law
   - Regulatory authorities: As required by law (e.g., 72 hours under GDPR)
   - Law enforcement: If criminal activity is reasonably suspected

3. **Breach Notification Should Include**
   - Types of data believed to be affected
   - Estimated number of affected merchants (if known)
   - Approximate date range of affected data
   - Actions taken or planned for remediation
   - Recommended steps merchants may consider taking

4. **Remediation Efforts**
   - Consider offering appropriate support services
   - Provide dedicated support channel as resources permit
   - Enhanced monitoring for potentially affected accounts
   - Provide regular status updates as appropriate

---

## 7. Security Measures in Place

### Preventive Controls

1. **Authentication & Authorization**
   - Shopify OAuth 2.0 with token exchange
   - HMAC-SHA256 webhook validation
   - Multi-secret support for credential rotation
   - Session-based access control

2. **Data Protection**
   - All webhook payloads archived to S3 (encrypted at rest)
   - DynamoDB encryption at rest (AWS managed keys)
   - S3 bucket encryption enabled
   - Sensitive data never logged in plain text

3. **Network Security**
   - API Gateway with rate limiting
   - AWS WAF rules for common attacks
   - IP allowlisting for admin functions
   - TLS 1.2+ for all communications

4. **Access Control**
   - AWS IAM least-privilege principle
   - Lambda execution roles with minimal permissions
   - No hardcoded credentials in code
   - Environment variables for secrets

5. **Audit & Logging**
   - All API requests logged
   - CloudWatch logs retention: 90 days
   - S3 webhook archives: indefinite retention
   - DynamoDB audit logs: 90-day TTL (checked daily)
   - Failed authentication tracking (reviewed weekly)
   - Unusual API call patterns (automated alerts)
   - Data access auditing (reviewed monthly)

2. **Regular Assessments**
   - Weekly: Dependency vulnerability scans (npm audit)
   - Monthly: Security log reviews
   - Quarterly: Code security reviews
   - Annually: Third-party penetration testing (if budget allows)
   - Continuous: Automated SAST scanning in CI/CD
2. **Regular Assessments**
   - Monthly dependency vulnerability scans
   - Quarterly code security reviews
   - Annual penetration testing
   - Continuous SAST/DAST scanning

---

## 8. Incident Response Tools & Resources

### Technical Tools
- **AWS CloudWatch**: Log analysis and alerting
- **AWS CloudTrail**: API activity tracking
- **AWS GuardDuty**: Threat detection (if enabled)
- **npm audit**: Dependency vulnerability scanning
- **OWASP ZAP**: Security testing

### Documentation
- Incident report templates (internal wiki)
- Breach notification templates (approved by legal)
- Merchant communication scripts
- Runbooks for common incidents

### External Resources
- AWS Security Hub
- Shopify Security Guidelines
- OWASP Top 10
- NIST CybersecuritAnnually or as needed)
- Security best practices for development
- Incident response procedures walkthrough
- Phishing awareness and social engineering
- Secure coding guidelines (OWASP Top 10)
- Data protection and GDPR requirements

### Incident Response Drills (Annually)
- Tabletop exercises for common scenarios
- Credential rotation practice
- Recovery procedure validation
- Communication protocol testing

**Note:** For solo developers or small teams, training may consist of self-study, online courses, and security conference attendance.

### Incident Response Drills (Bi-annually)
- Tabletop exercises
- Simulated breach scenarios
- Communication protocol testing
- Recovery procedure validation

---

## 10. Policy Review and Updates

**Review Frequency:** Quarterly or after any major incident

**Update Triggers:**
- New security threats identified
- Changes to regulatory requirements
- Post-incident lessons learned
- Technology stack changes
- Organizational changes

**ApShopify Partner Program Compliance

**Required Security Measures (Met):**
- ✅ Secure authentication using Shopify OAuth 2.0
- ✅ HMAC validation for all webhook requests
- ✅ HTTPS/TLS encryption for all communications
- ✅ Secure credential storage (no hardcoded secrets)
- ✅ GDPR compliance webhooks implemented
- ✅ Privacy policy publicly accessible
- ✅ Data deletion on app uninstall (shop/redact webhook)
- ✅ Regular security updates and dependency patching
- ✅ Incident response plan documented
- ✅ Security vulnerability disclosure process

**Shopify App Store Review Requirements:**
- ✅ Security questionnaire completed
- ✅ OAuth scopes justified and minimal
- ✅ Data handling practices documented
- ✅ Third-party services disclosed (AWS)
- ✅ Webhook payload archiving for audit

### proval Process:**
- Technical review by development team
- Security review by external consultant (if applicable)
- Final approval by technical director

---

## 11. Contact Information

### Security Incident Reporting

**Primary Contact:*24 hours for P0/P1, < 3 business days for P2/P3
- Availability: Business hours with best-effort after-hours monitoring

**Emergency Escalation:**
- Phone: [Redacted - Internal Use Only]
- Available: Business hours (9 AM - 6 PM IST)
- After Hours: Emergency email to security@gstgo-app.com (monitored within 12 hours)
- Phone: [Redacted - Internal Use Only]
- Available: 24/7 for P0 incidents

**Shopify Partner Support:**
- Partner Dashboard: https://partners.shopify.com/
- Email: partners@shopify.com
- Security Email: security@shopify.com

---
13. Vulnerability Disclosure Program

### Reporting Security Vulnerabilities

**We encourage responsible disclosure of security vulnerabilities.**

**Reporting Channels:**
- Email: security@gstgo-app.com
- Subject: "[SECURITY] Vulnerability Report - GSTGo"
- PGP Key: [To be added if available]

**What to Include:**
- Detailed description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Proof of concept (if applicable)
- Your contact information

**Target Response Timeline:**
- Acknowledgment: Within 2 business days
- Severity assessment: Within 5 business days
- Resolution targets: Based on severity (subject to complexity)
  - Critical: 7-14 days (best effort)
  - High: 30 days (best effort)
  - Medium: 60 days (best effort)
  - Low: 90 days (best effort)

**Responsible Disclosure Guidelines:**
- We request 90 days to address the issue before public disclosure
- We endeavor to keep you informed of progress every 2-3 weeks
- Do not exploit the vulnerability beyond proof of concept
- Do not access, modify, or delete user data
- Do not perform DoS/DDoS attacks

**Recognition:**
- Security researchers will be credited (with permission)
- Hall of Fame page on our website (planned)
- Coordinated disclosure after fix deployment

---

## 14. Shopify-Specific Incident Scenarios

### Scenario 1: Compromised API Credentials

**If SHOPIFY_API_KEY or SHOPIFY_API_SECRET compromised:**

1. **Immediate Response (Target: within 2 hours):**
   - Generate new credentials in Shopify Partner Dashboard
   - Update Lambda environment variables
   - Redeploy application
   - Invalidate all existing sessions

2. **Notification (Target: within 24 hours):**
   - Notify Shopify Partner Support: security@shopify.com
   - Document how credentials were exposed
   - Provide timeline of exposure window

3. **Investigation (Target: within 48 hours):**
   - Review CloudWatch logs for unauthorized API calls
   - Check for data exfiltration
   - Verify no unauthorized app installations
   - Audit all API requests during exposure window

4. **Follow-up:**
   - Implement additional secret scanning tools
   - Review code for hardcoded credentials
   - Update secret rotation schedule

### Scenario 2: Webhook HMAC Bypass Detected

**If unauthorized webhooks received without valid HMAC:**

1. **Immediate:**
   - Block offending IP at API Gateway/WAF level
   - Enable additional webhook validation
   - Review S3 webhook archives for suspicious payloads

2. **Investigation:**
   - Analyze how HMAC was bypassed or spoofed
   - Check for timing attack vulnerabilities
   - Review webhook validation code for flaws

3. **Remediation:**
   - Patch webhook validation logic
   - Deploy updated code
   - Test with Shopify webhook tester
   - Re-subscribe to all webhooks with fresh secrets

### Scenario 3: Merchant Data Exposure via S3

**If S3 bucket misconfiguration exposes merchant data:**

1. **Immediate:**
   - Make bucket private (block public access)
   - Review bucket policy and ACLs
   - Identify affected files and merchants
   - Preserve evidence (CloudTrail logs)

2. **Assessment:**
   - Determine if data was accessed by unauthorized parties
   - Review S3 access logs for external IPs
   - Count affected merchants and data types

3. **Notification:**
   - Shopify: Target within 24 hours of confirmation
   - Affected merchants: Target within 72 hours as required by applicable law
   - Include: What data believed affected, approximate time period, planned remediation steps

4. **Prevention:**
   - Implement S3 bucket policies with least privilege
   - Enable S3 Block Public Access at account level
   - Add automated bucket configuration scanning

### Scenario 4: Malicious Code Injection via Dependency

**If npm package vulnerability or supply chain attack:**

1. **Detection:**
   - npm audit alerts
   - Snyk/Dependabot alerts
   - Manual code review

2. **Immediate:**
   - Identify affected dependency and version
   - Remove or downgrade to safe version
   - Rebuild and redeploy immediately
   - Scan for indicators of compromise

3. **Investigation:**
   - Review all code changes from malicious package
   - Check for backdoors or data exfiltration
   - Audit recent API calls and data access
   - Review CloudWatch logs for anomalies

4. **Prevention:**
   - Lock dependency versions in package-lock.json
   - Use npm audit in CI/CD pipeline
   - Review dependencies before updates
   - Implement Subresource Integrity (SRI) checks

---

## 
## 12. Compliance and Legal

### Regulatory Framework
- GDPR (General Data Protection Regulation)
- IT Act 2000 (India)
- Shopify Partner Program Policies
- PCI DSS (if handling payment data)

### Data Protection Officer (DPO)
- Email: dpo@gstgo-app.com
- Responsible for GDPR compliance
- Contact for data breach notifications

### Legal Counsel
- Retained for incident response
- Available for breach notification review
- Advises on regulatory obligations

---

## Appendix A: Incident Report Template

```
INCIDENT REPORT #[YYYY-MM-DD-XXX]

1. DETECTION
   - Date/Time: 
   - Detected By: 
   - Detection Method: 
   - Initial Severity: 

2. DESCRIPTION
   - Affected Systems: 
   - Type of Incident: 
   - Potential Impact: 

3. CONTAINMENT
   - Actions Taken: 
   - Time to Containment: 
   - Evidence Preserved: 

4. ERADICATION
   - Root Cause: 
   - Remediation Steps: 
   - Verification: 

5. RECOVERY
   - Services Restored: 
   - Validation Completed: 
   - Return to Normal: 

6. LESSONS LEARNED
   - What Went Well: 
   - What Could Improve: 
   - Action Items: 

7. FOLLOW-UP
   - Preventive Measures: 
   - Policy Updates: 
   - Training Needs: 
```

---

**Document Version History:**
- v1.0 (2026-02-16): Initial policy creation

**Next Review Date:** May 16, 2026

**Legal Disclaimer:** This Security Incident Response Policy is provided for informational purposes and represents our current security practices and incident response approach. It does not constitute a legally binding agreement, warranty, or guarantee of specific response times or outcomes. We reserve the right to modify this policy at any time. Actual incident response activities will be conducted in accordance with applicable laws and regulations and may vary based on specific circumstances. For questions or concerns, please contact security@gstgo-app.com.

