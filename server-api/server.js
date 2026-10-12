const express = require("express");
const { Client } = require("@elastic/elasticsearch");
const cors = require("cors");

const es = new Client({ node: "http://localhost:9200" });
const app = express();

app.use(cors());
app.use(express.json());

async function bootstrap() {
	const idx = "products";
	const exists = await es.indices.exists({ index: idx });
	if (!exists) {
		await es.indices.create({
			index: idx,
			body: {
				mappings: {
					properties: {
						name: { type: "text" },
						desc: { type: "text" },
						price: { type: "double" },
						tags: { type: "keyword" },
					},
				},
			},
		});

		await es.helpers.bulk({
			datasource: [
				{
					name: "Apple iPhone 14",
					desc: "Smartphone from Apple",
					price: 799,
					tags: ["mobile", "apple"],
				},
				{
					name: "Samsung Galaxy S23",
					desc: "Flagship Android phone",
					price: 699,
					tags: ["mobile", "android"],
				},
				{
					name: "Sony WH-1000XM5",
					desc: "Noise-canceling over-ear headphones",
					price: 399,
					tags: ["audio", "sony"],
				},
			],
			onDocument(doc) {
				return { index: { _index: idx } };
			},
			refreshOnCompletion: true,
		});

		console.log(`Indexed sample documents into "${idx}".`);
	}
}

bootstrap().catch(console.error);

// Search endpoint
app.get("/search", async (req, res) => {
	const q = req.query.q || "";

	let body;

	if (q.trim() === "") {
		body = {
			query: {
				match_all: {},
			},
		};
	} else {
		body = {
			query: {
				multi_match: {
					query: q,
					fields: ["name^2", "desc"],
				},
			},
			suggest: {
				text: q,
				simple_phrase: {
					phrase: {
						field: "desc",
						size: 1,
						gram_size: 3,
					},
				},
			},
		};
	}

	try {
		const { hits, suggest } = await es.search({ index: "products", body });
		res.status(200).json({
			hits: hits.hits.map((h) => h._source),
			suggest: suggest ? suggest.simple_phrase : [],
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: err.message });
	}
});


app.post("/api/products", async (req, res) => {
	try {
		const { name, desc, price, tags } = req.body;
		const result = await es.index({
			index: "products",
			document: {
				name: name,
				desc: desc,
				price: parseFloat(price),
				tags: tags || [],
			},
			refresh: "wait_for",
		});

		res.status(201).json({
			message: "Product saved successfully!",
			id: result._id,
		});
	} catch (err) {
		console.error("Error saving document:", err);
		res.status(500).json({ error: err.message });
	}
});

app.listen(4000, () => {
	console.log("Search API listening on http://localhost:4000");
});
