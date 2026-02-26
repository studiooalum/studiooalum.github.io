const projectId = '9bsud0bl';
const dataset = 'production';
const apiVersion = '2023-01-01';
const useCdn = true;

const apiHost = useCdn
  ? `https://${projectId}.apicdn.sanity.io`
  : `https://${projectId}.api.sanity.io`;

const baseUrl = `${apiHost}/v${apiVersion}/data/query/${dataset}`;

export const sanityConfig = { projectId, dataset, apiVersion, useCdn, apiHost, baseUrl };

async function fetchQuery(query, params = {}) {
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

export default {
  fetch: fetchQuery,
};