# Deployment & Firewall Notes: Cloudflare Wildcards & Security

This document captures the findings and architectural decisions regarding DNS, SSL (Let's Encrypt), Firewalls, and Cloudflare integration when hosting the LMS on Dokploy/Netcup.

## The Problem: Traefik Timeout Errors
When attempting to setup wildcard subdomains (`*.preciopana.com`) with Let's Encrypt on Traefik, we encountered two timeout errors:
1. **HTTP Challenge Timeout (Port 80):** Let's Encrypt could not reach the server because the Netcup hardware firewall restricted ports 80 and 443 to *only* Cloudflare IPs. Since the wildcard record in Cloudflare was set to DNS Only (Grey Cloud), Let's Encrypt tried to connect directly (not via Cloudflare) and was blocked by Netcup.
2. **DNS Challenge Timeout (Port 53):** Traefik could not reach Cloudflare's DNS (1.1.1.1:53) because UFW (Ubuntu's internal firewall) blocks Docker's outbound requests by default. (Since Netcup provides a hardware firewall, UFW is redundant and should be disabled).

## The Cloudflare Limitation
On Cloudflare Free/Pro/Business tiers, **wildcard DNS records (`*`) cannot be proxied (Orange Cloud)**. They must be DNS Only (Grey Cloud). This means wildcard traffic hits the server directly. If the server firewall only allows Cloudflare IPs, the wildcard traffic is completely blocked.

## The Solution: Option B (Strict Cloudflare Proxying)
To maintain maximum security (keeping the Netcup firewall restricted *only* to Cloudflare IPs and keeping all traffic Proxied/Orange Cloud), we cannot use a blanket `*` wildcard record.

Instead, we must dynamically create an explicit `A` record for every new school via the Cloudflare API when a user finishes the `/create-school` flow.

### Implementation Plan for Option B (To be done in the future)

#### 1. Environment Variables
Add these to `.env.local` and Dokploy environment variables:
```env
CLOUDFLARE_ZONE_ID=your_zone_id_here
SERVER_IP=152.53.160.37
# CF_DNS_API_TOKEN is already present
```

#### 2. Server Action (e.g., `app/actions/cloudflare.ts`)
```typescript
'use server'

export async function createCloudflareSubdomain(slug: string) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CF_DNS_API_TOKEN;
  const serverIp = process.env.SERVER_IP;

  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`
    },
    body: JSON.stringify({
      type: 'A',
      name: slug,          // e.g., "myschool"
      content: serverIp,   // Netcup IP
      ttl: 1,              // Auto TTL
      proxied: true        // Enables Cloudflare Proxy (Orange Cloud)
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("Cloudflare Error:", errorData);
    throw new Error('Failed to create secure subdomain');
  }

  return await response.json();
}
```

#### 3. Integration in `/create-school` Flow
In `components/tenant/create-school-form.tsx`, call the new action right after the tenant gets inserted into the database:
```typescript
import { createCloudflareSubdomain } from "@/app/actions/cloudflare";

// Inside form submit handler:
try {
  // 1. Create school in Supabase...
  
  // 2. Provision Cloudflare subdomain dynamically
  await createCloudflareSubdomain(data.slug);
  
  // 3. Show a loading state (e.g., waiting 5-10s for DNS propagation)
  
  // 4. Redirect
  window.location.href = `https://${data.slug}.preciopana.com`;
} catch (error) {
  toast.error("Error creating school.");
}
```

**Next Steps for Migration:**
- Remove the `*` record from Cloudflare.
- Keep Netcup firewall restricted to Cloudflare IPs.
- Implement the Cloudflare API integration.
- Ensure Dokploy/Traefik expects specific subdomains or gracefully routes them. Since Cloudflare manages the SSL Edge Certificates for proxied records, Traefik doesn't strictly need to do ACME TLS challenges for them as long as Cloudflare communicates with Traefik over HTTP or uses a Cloudflare Origin Cert.
