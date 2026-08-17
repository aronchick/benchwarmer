export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: browserSafeHeaders(response.headers),
    });
  },
};

export function browserSafeHeaders(source) {
  const headers = new Headers(source);

  // Upstream storage providers may attach a document-level CSP that blocks
  // Benchwarmer's own CSS and JavaScript when their response is proxied.
  headers.delete("content-security-policy");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}
