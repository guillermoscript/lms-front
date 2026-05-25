'use server'

export async function createCloudflareSubdomain(slug: string) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CF_DNS_API_TOKEN;
  const serverIp = process.env.SERVER_IP;
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN;

  if (!zoneId || !apiToken || !serverIp || !platformDomain) {
    console.error("Missing Cloudflare or server environment variables");
    // If not configured, we just return safely, assuming local dev or wildcards
    return { success: false, reason: "Missing ENV vars" };
  }

  const fullRecordName = `${slug}.${platformDomain}`;

  console.log(`Creating proxied Cloudflare DNS record for: ${fullRecordName}`);

  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({
        type: 'A',
        name: fullRecordName, // Must use the full domain like myschool.preciopana.com
        content: serverIp,    // Netcup IP
        ttl: 1,               // 1 = Auto
        proxied: true         // Enables the Orange Cloud proxy (DDoS, SSL, WAF)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Cloudflare API Error:", JSON.stringify(errorData, null, 2));
      
      // If the record already exists (error 81057), that's fine, we can ignore it
      const alreadyExists = errorData.errors?.some((e: any) => e.code === 81057);
      if (alreadyExists) {
        return { success: true, reason: "Already exists" };
      }

      throw new Error(`Cloudflare API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error("Error creating subdomain:", error);
    throw error;
  }
}
