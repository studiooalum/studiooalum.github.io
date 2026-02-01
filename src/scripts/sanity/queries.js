
// Query to fetch the Patchwork gloves product
export const PATCHWORK_GLOVES_QUERY = `
	*[_type == "product" && title match "Patchwork gloves"]{
		_id,
		title,
		description,
		"image": images[0].asset->url,
		images[] {
			asset->
		},
		slug
	}[0]
`;
