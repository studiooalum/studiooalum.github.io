const projectId = '9bsud0bl';
const dataset = 'production';
const apiVersion = '2023-01-01';
const useCdn = true;

const apiHost = useCdn
  ? `https://${projectId}.apicdn.sanity.io`
  : `https://${projectId}.api.sanity.io`;

const baseUrl = `${apiHost}/v${apiVersion}/data/query/${dataset}`;
const proxyPath = "/api/sanity/query";

export const sanityConfig = { projectId, dataset, apiVersion, useCdn, apiHost, baseUrl };

function canUseProxy() {
  return typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);
}

async function fetchViaProxy(query, params = {}) {
  const response = await fetch(proxyPath, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      query,
      params,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error || `Sanity proxy failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return payload?.result || [];
}

async function fetchDirect(query, params = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('query', query);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(`$${key}`, JSON.stringify(value));
  });

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sanity query failed: ${res.status} ${res.statusText}${body ? `\n${body}` : ''}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Sanity query error: ${json.error.description || json.error.message || 'Unknown error'}`);
  }
  return json.result;
}

async function fetchQuery(query, params = {}) {
  if (canUseProxy()) {
    try {
      return await fetchViaProxy(query, params);
    } catch (error) {
      if (Number(error?.status) !== 404) {
        throw error;
      }
    }
  }

  return fetchDirect(query, params);
}

export default {
  fetch: fetchQuery,
};