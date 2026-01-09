/**
 * NZ Electricity Map - Offers API
 * Serves offer data from D1 database
 */

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// GET /v1/offers/unit/:unitCode
			// Example: /v1/offers/unit/TST0
			if (url.pathname.startsWith('/v1/offers/unit/')) {
				const unitCode = url.pathname.split('/').pop();

				const results = await env.OFFERS_DB.prepare(
					'SELECT * FROM offers WHERE Unit = ? ORDER BY TradingDate, TradingPeriod, Tranche LIMIT 100'
				).bind(unitCode).all();

				return Response.json(results.results, { headers: corsHeaders });
			}

			// GET /v1/offers/date/:date
			// Example: /v1/offers/date/2025-12-30
			if (url.pathname.startsWith('/v1/offers/date/')) {
				const date = url.pathname.split('/').pop();

				const results = await env.OFFERS_DB.prepare(
					'SELECT TradingPeriod, Site, Unit, Tranche, Megawatts, DollarsPerMegawattHour FROM offers WHERE TradingDate = ? ORDER BY TradingPeriod, Site, Unit, Tranche'
				).bind(date).all();

				// Transform to grouped format: { timestamp: [{ site, unit, tranches: [...] }] }
				const grouped = {};

				for (const row of results.results) {
					// Convert trading period (1-48) to timestamp
					// Period 1 = 00:00-00:30, Period 2 = 00:30-01:00, etc.
					const periodStart = (row.TradingPeriod - 1) * 30;
					const hours = Math.floor(periodStart / 60);
					const minutes = periodStart % 60;
					const timestamp = `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

					// Initialize timestamp group if needed
					if (!grouped[timestamp]) {
						grouped[timestamp] = [];
					}

					// Find or create site/unit entry
					let siteEntry = grouped[timestamp].find(s => s.site === row.Site && s.unit === row.Unit);
					if (!siteEntry) {
						siteEntry = {
							site: row.Site,
							unit: row.Unit,
							tranches: []
						};
						grouped[timestamp].push(siteEntry);
					}

					// Add tranche
					siteEntry.tranches.push({
						tranche: row.Tranche,
						megawatts: row.Megawatts,
						price: row.DollarsPerMegawattHour
					});
				}

				return Response.json(grouped, { headers: corsHeaders });
			}

			// GET /v1/offers/poc/:poc
			// Example: /v1/offers/poc/TEST001
			if (url.pathname.startsWith('/v1/offers/poc/')) {
				const poc = url.pathname.split('/').pop();

				const results = await env.OFFERS_DB.prepare(
					'SELECT * FROM offers WHERE PointOfConnection = ? ORDER BY TradingDate, TradingPeriod, Tranche LIMIT 100'
				).bind(poc).all();

				return Response.json(results.results, { headers: corsHeaders });
			}

			// GET /v1/offers/generator?unit=TST0&date=2025-12-30
			if (url.pathname === '/v1/offers/generator') {
				const unit = url.searchParams.get('unit');
				const date = url.searchParams.get('date');

				if (!unit || !date) {
					return Response.json({ error: 'Missing unit or date parameter' }, { status: 400, headers: corsHeaders });
				}

				const results = await env.OFFERS_DB.prepare(
					'SELECT * FROM offers WHERE Unit = ? AND TradingDate = ? ORDER BY TradingPeriod, Tranche'
				).bind(unit, date).all();

				return Response.json(results.results, { headers: corsHeaders });
			}

			// GET /v1/offers/stats - Database stats
			if (url.pathname === '/v1/offers/stats') {
				const count = await env.OFFERS_DB.prepare('SELECT COUNT(*) as count FROM offers').first();
				const latestDate = await env.OFFERS_DB.prepare('SELECT MAX(TradingDate) as latest FROM offers').first();

				return Response.json({
					totalOffers: count.count,
					latestTradingDate: latestDate.latest
				}, { headers: corsHeaders });
			}

			// Default response
			return Response.json({
				message: 'NZ Electricity Map - Offers API',
				endpoints: [
					'GET /v1/offers/unit/:unitCode',
					'GET /v1/offers/date/:date',
					'GET /v1/offers/poc/:pointOfConnection',
					'GET /v1/offers/generator?unit=UNIT&date=YYYY-MM-DD',
					'GET /v1/offers/stats'
				]
			}, { headers: corsHeaders });

		} catch (error) {
			return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
		}
	},
};
