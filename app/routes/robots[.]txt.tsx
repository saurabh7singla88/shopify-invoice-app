/**
 * robots.txt route
 * Prevents search engine crawling of the embedded app
 */
export async function loader() {
  const robotsTxt = `User-agent: *
Disallow: /

# This is an embedded Shopify app
# Not meant to be crawled by search engines`;

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400", // Cache for 1 day
    },
  });
}
