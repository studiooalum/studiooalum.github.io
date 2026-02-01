import sanityClient from '@sanity/client';

export default sanityClient({
  projectId: '9bsud0bl', // from sanity.config.js
  dataset: 'production',
  useCdn: true,                 // `false` if you want fresh data
  apiVersion: '2023-01-01',     // Use a date string (YYYY-MM-DD)
});