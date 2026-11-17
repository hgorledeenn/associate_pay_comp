// ==========================================
// 1. CONFIGURATION & PLACEHOLDER USER STATE
// ==========================================

const userState = {
    assoc_year: 3,                          // Numeric 1-9 matching CSV's assoc_year
    assoc_title: "Third",                   // Display label for "{Your Class}" header
    firm_size_clean: "Up to 100 attorneys",
    state: 11,
    fin_base: 165000,
    fin_bonus: 22000,
    total_comp: 187000
};

// The 3 stacked metric sections
const METRICS = [
    { key: "total_comp", label: "Total Compensation" },
    { key: "fin_base",   label: "Base Salary" },
    { key: "fin_bonus",  label: "Bonus" }
];

// Row ordering: <100 -> 101-600 -> 600+ -> All sizes
const FIRM_SIZES = [
    { id: "small",  label: "<100",      filterValue: "Up to 100 attorneys" },
    { id: "medium", label: "101–600",   filterValue: "101-600 attorneys" },
    { id: "large",  label: "600+",      filterValue: "More than 600 attorneys" },
    { id: "all",    label: "All sizes", filterValue: null }
];

// Shared vertical geometry so labels and both chart columns align to the exact pixel
const CHART_GEOM = {
    height: 126,
    marginTop: 18,    // Room at top for the "$187k" user pay label
    marginBottom: 20  // Room at bottom for the X-axis ticks
};

function formatK(val) {
    if (val === null || isNaN(val)) return "";
    if (val === 0) return "$0";
    return `$${Math.round(val / 1000)}k`;
}

function formatSignedK(val) {
    if (val === null || isNaN(val)) return "";
    const rounded = Math.round(val / 1000);
    if (rounded === 0) return "$0";
    return rounded > 0 ? `+$${rounded}k` : `-$${Math.abs(rounded)}k`;
}

// ==========================================
// 2. DATA WRANGLING
// ==========================================

async function initDashboard() {
    // Load CSV and pre-projected GeoJSON in parallel
    const [rawData, regionsGeo] = await Promise.all([
        d3.csv("unclean/data_11_12.csv", (d) => ({
            assoc_year: +d.assoc_year,
            assoc_title: d.assoc_title,
            fin_base: d.fin_base !== "" ? +d.fin_base : null,
            fin_bonus: d.fin_bonus !== "" ? +d.fin_bonus : null,
            total_comp: d.total_comp !== "" ? +d.total_comp : null,
            firm_size_clean: d.firm_size_clean ? d.firm_size_clean.trim() : "",
            state: +d.state,
            state_name: d.state_name,
            region: d.region ? d.region.trim() : ""
        })),
        d3.json("regions_map.geojson")
    ]);

    // Auto-calculate [min, max] scale for each of the 3 dumbbell sections individually
    const domainsByMetric = {};
    METRICS.forEach((metric) => {
        const validValues = rawData
            .map((d) => d[metric.key])
            .filter((v) => v !== null && !isNaN(v));

        const userVal = userState[metric.key];
        if (userVal !== null && !isNaN(userVal)) {
            validValues.push(userVal);
        }

        const sectionMin = d3.min(validValues) ?? 0;
        const sectionMax = d3.max(validValues) ?? 100000;
        domainsByMetric[metric.key] = [sectionMin, sectionMax];
    });

    buildDashboardGrid(rawData, domainsByMetric);
    buildRegionalMap(rawData, regionsGeo);
    buildMultiLineChart(rawData);
}

// ==========================================
// 3. GRID & DUMBBELL RENDERING (#act-dot-plots)
// ==========================================

function buildDashboardGrid(data, domainsByMetric) {
    const root = d3.select("#act-dot-plots");
    root.html(""); // Clear existing content

    // --- 3 Metric Sections inside one unified outer card ---
    METRICS.forEach((metric, metricIndex) => {
        const isFirstSection = metricIndex === 0;

        const section = root.append("div")
            .attr("class", "act-metric-group");

        // Title bar with dark navy underline
        const header = section.append("div")
            .attr("class", "act-metric-header");

        header.append("h3")
            .attr("class", "act-metric-title")
            .text(metric.label);

        // Render the boxed legend inline on the right of "Total Compensation" only
        if (isFirstSection) {
            const legendBox = header.append("div")
                .attr("class", "act-legend-box");

            legendBox.append("span")
                .attr("class", "act-legend-item")
                .html(`<span class="act-swatch-min"></span> Min`);

            legendBox.append("span")
                .attr("class", "act-legend-item")
                .html(`<span class="act-swatch-range"></span> Pay range`);

            legendBox.append("span")
                .attr("class", "act-legend-item")
                .html(`<span class="act-swatch-max"></span> Max`);

            legendBox.append("span")
                .attr("class", "act-legend-item")
                .html(`<span class="act-swatch-user"></span> Your pay`);
        }

        // 3-column CSS Grid: [Firm Size] | [{Your Class}] | [All Associates]
        const grid = section.append("div")
            .attr("class", "act-plot-grid");

        // Render column headers ONLY at the top of the first section
        if (isFirstSection) {
            const firmHeader = grid.append("div")
                .attr("class", "act-col-header");
            firmHeader.append("div").text("Firm Size");
            firmHeader.append("div")
                .attr("class", "act-col-subhead")
                .text("(# attys)");

            grid.append("div")
                .attr("class", "act-col-header act-col-divider")
                .text(`${userState.assoc_title}-Year`);

            grid.append("div")
                .attr("class", "act-col-header act-col-divider")
                .text("All Associates");
        }

        // Shared Y-scale used across all 3 columns so text and bars align identically
        const yScale = d3.scalePoint()
            .domain(FIRM_SIZES.map((s) => s.label))
            .range([CHART_GEOM.marginTop + 12, CHART_GEOM.height - CHART_GEOM.marginBottom - 10]);

        // Col 1: Firm-size labels SVG
        const labelCol = grid.append("div")
            .attr("class", "act-svg-col");
        drawLabelColumn(labelCol, yScale);

        // Summarize min/max for each firm-size tier
        const summarizeSlice = (filterByClass) =>
            FIRM_SIZES.map((sizeObj) => {
                const slice = data.filter((d) =>
                    (sizeObj.filterValue === null || d.firm_size_clean === sizeObj.filterValue) &&
                    (!filterByClass || d.assoc_year === userState.assoc_year) &&
                    d[metric.key] !== null
                ).map((d) => d[metric.key]);

                return {
                    label: sizeObj.label,
                    min: slice.length ? d3.min(slice) : null,
                    max: slice.length ? d3.max(slice) : null
                };
            });

        // Col 2: Viewer's Class dumbbell plot
        const classCol = grid.append("div")
            .attr("class", "act-svg-col act-col-divider");
        drawDumbbellColumn({
            container: classCol,
            rows: summarizeSlice(true),
            userValue: userState[metric.key],
            domain: domainsByMetric[metric.key],
            yScale
        });

        // Col 3: All Associates dumbbell plot
        const allCol = grid.append("div")
            .attr("class", "act-svg-col act-col-divider");
        drawDumbbellColumn({
            container: allCol,
            rows: summarizeSlice(false),
            userValue: userState[metric.key],
            domain: domainsByMetric[metric.key],
            yScale
        });
    });
}

function drawLabelColumn(container, yScale) {
    const width = 54;
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${CHART_GEOM.height}`)
        .attr("preserveAspectRatio", "xMinYMid meet");

    FIRM_SIZES.forEach((sizeObj) => {
        svg.append("text")
            .attr("class", "act-row-text")
            .attr("x", 0)
            .attr("y", yScale(sizeObj.label))
            .attr("dominant-baseline", "middle")
            .text(sizeObj.label);
    });
}

function drawDumbbellColumn({ container, rows, userValue, domain, yScale }) {
    const width = 125;
    const margin = { left: 6, right: 6 };
    const axisY = CHART_GEOM.height - CHART_GEOM.marginBottom;

    const xScale = d3.scaleLinear()
        .domain(domain)
        .range([margin.left, width - margin.right]);

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${CHART_GEOM.height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // 1. Subtle horizontal row tracks
    rows.forEach((row) => {
        svg.append("line")
            .attr("class", "act-gridline")
            .attr("x1", margin.left)
            .attr("x2", width - margin.right)
            .attr("y1", yScale(row.label))
            .attr("y2", yScale(row.label));
    });

    // 2. Dumbbell bars (rounded gray range bar + white-outlined min & max dots)
    const barHeight = 6;
    const dotRadius = 3.2;

    rows.forEach((row) => {
        if (row.min === null || row.max === null) return;

        const y = yScale(row.label);
        const x1 = xScale(row.min);
        const x2 = xScale(row.max);

        svg.append("rect")
            .attr("class", "act-range-bar")
            .attr("x", x1)
            .attr("y", y - barHeight / 2)
            .attr("width", Math.max(2, x2 - x1))
            .attr("height", barHeight)
            .attr("rx", barHeight / 2);

        svg.append("circle")
            .attr("class", "act-min-dot")
            .attr("cx", x1)
            .attr("cy", y)
            .attr("r", dotRadius);

        svg.append("circle")
            .attr("class", "act-max-dot")
            .attr("cx", x2)
            .attr("cy", y)
            .attr("r", dotRadius);
    });

    // 3. Continuous vertical benchmark line + dollar callout above top row
    if (userValue !== null && !isNaN(userValue)) {
        const ux = xScale(userValue);
        const lineTopY = CHART_GEOM.marginTop - 3;

        svg.append("line")
            .attr("class", "act-user-line")
            .attr("x1", ux)
            .attr("x2", ux)
            .attr("y1", lineTopY)
            .attr("y2", axisY);

        let anchor = "middle";
        let labelX = ux;
        if (ux < margin.left + 16) {
            anchor = "start";
            labelX = margin.left;
        } else if (ux > width - margin.right - 16) {
            anchor = "end";
            labelX = width - margin.right;
        }

        svg.append("text")
            .attr("class", "act-user-label")
            .attr("x", labelX)
            .attr("y", lineTopY - 3)
            .attr("text-anchor", anchor)
            .text(formatK(userValue));
    }

    // 4. Clean hairline bottom axis showing [min, midpoint, max]
    const midVal = (domain[0] + domain[1]) / 2;
    const xAxis = d3.axisBottom(xScale)
        .tickValues([domain[0], midVal, domain[1]])
        .tickSize(3)
        .tickFormat((d) => formatK(d));

    const axisGroup = svg.append("g")
        .attr("class", "act-axis")
        .attr("transform", `translate(0, ${axisY})`)
        .call(xAxis);

    axisGroup.select(".tick:first-of-type text").attr("text-anchor", "start");
    axisGroup.select(".tick:last-of-type text").attr("text-anchor", "end");
}

// ==========================================
// 4. REGIONAL CHOROPLETH MAP (#act-map)
// ==========================================

function buildRegionalMap(data, geojson) {
    const root = d3.select("#act-map");
    root.html(""); // Clear existing content

    // 1. Header matching the left column's .act-metric-header style
    const header = root.append("div")
        .attr("class", "act-metric-header");

    header.append("h3")
        .attr("class", "act-metric-title")
        .text("Regional Total Comp vs. You");

    // 2. Aggregate average total_comp per region across all associates (excluding "None")
    const regionStats = new Map();
    const grouped = d3.group(
        data.filter((d) => d.region && d.region !== "None" && d.total_comp !== null),
        (d) => d.region
    );

    grouped.forEach((rows, regionName) => {
        const avg = d3.mean(rows, (d) => d.total_comp);
        const diff = avg - userState.total_comp;
        regionStats.set(regionName, {
            region: regionName,
            avg,
            diff,
            count: rows.length
        });
    });

    // 3. Determine min/max differences for the diverging color scale
    const diffs = Array.from(regionStats.values()).map((d) => d.diff);
    const rawMin = d3.min(diffs) ?? 0;
    const rawMax = d3.max(diffs) ?? 0;

    // Clamp domain ends around 0 so #BFC9C9 always represents $0 (exact parity with user)
    const minDiff = Math.min(0, rawMin);
    const maxDiff = Math.max(0, rawMax);

    const colorLow = "#D66853";     // Furthest below user's total comp
    const colorMid = "#BFC9C9";     // Parity ($0 difference)
    const colorHigh = "#364559";    // Furthest above user's total comp
    const colorNoData = "#f3f4f6";  // Light gray for "None" / no survey data

    let colorScale;
    let gradientCss;
    let tickLabels;

    if (minDiff < 0 && maxDiff > 0) {
        const zeroPct = (Math.abs(minDiff) / (maxDiff - minDiff)) * 100;
        colorScale = d3.scaleLinear()
            .domain([minDiff, 0, maxDiff])
            .range([colorLow, colorMid, colorHigh]);
        gradientCss = `linear-gradient(to right, ${colorLow} 0%, ${colorMid} ${zeroPct}%, ${colorHigh} 100%)`;
        tickLabels = [formatSignedK(minDiff), "Your pay ($0)", formatSignedK(maxDiff)];
    } else if (maxDiff <= 0) {
        colorScale = d3.scaleLinear()
            .domain([minDiff, 0])
            .range([colorLow, colorMid]);
        gradientCss = `linear-gradient(to right, ${colorLow} 0%, ${colorMid} 100%)`;
        tickLabels = [formatSignedK(minDiff), "Your pay ($0)"];
    } else {
        colorScale = d3.scaleLinear()
            .domain([0, maxDiff])
            .range([colorMid, colorHigh]);
        gradientCss = `linear-gradient(to right, ${colorMid} 0%, ${colorHigh} 100%)`;
        tickLabels = ["Your pay ($0)", formatSignedK(maxDiff)];
    }

    // 4. Render SVG map using d3.geoIdentity() for pre-projected GeoJSON coordinates
    const svgWrap = root.append("div")
        .attr("class", "act-map-svg-wrap");

    const width = 240;
    const height = 145;

    // Note: If map renders upside down, switch .reflectY(true) to .reflectY(false)
    const projection = d3.geoIdentity()
        .reflectY(true)
        .fitSize([width, height], geojson);

    const pathGenerator = d3.geoPath().projection(projection);

    const svg = svgWrap.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // Reuse or create a single floating tooltip on <body>
    let tooltip = d3.select("body").select(".act-map-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("class", "act-map-tooltip");
    }

    svg.selectAll("path.act-region-path")
        .data(geojson.features)
        .enter()
        .append("path")
        .attr("class", "act-region-path")
        .attr("d", pathGenerator)
        .attr("fill", (feature) => {
            const regionName = feature.properties.region;
            if (!regionName || regionName === "None") return colorNoData;
            const stats = regionStats.get(regionName);
            return stats ? colorScale(stats.diff) : colorNoData;
        })
        .style("cursor", (feature) => {
            const regionName = feature.properties.region;
            return (!regionName || regionName === "None" || !regionStats.has(regionName)) ? "default" : "pointer";
        })
        .on("mousemove", (event, feature) => {
            const regionName = feature.properties.region;
            if (!regionName || regionName === "None") return;
            const stats = regionStats.get(regionName);
            if (!stats) return;

            tooltip
                .style("opacity", 1)
                .style("left", `${event.clientX + 12}px`)
                .style("top", `${event.clientY - 28}px`)
                .html(
                    `<strong>${stats.region}</strong><br>` +
                    `Avg total comp: <strong>${formatK(stats.avg)}</strong> (${formatSignedK(stats.diff)} vs. you)`
                );
        })
        .on("mouseleave", () => {
            tooltip.style("opacity", 0);
        });

    // 5. Auto-updating diverging gradient legend at the bottom of #act-map
    const legend = root.append("div")
        .attr("class", "act-map-legend");

    legend.append("div")
        .attr("class", "act-map-legend-bar")
        .style("background", gradientCss);

    const labelsRow = legend.append("div")
        .attr("class", "act-map-legend-labels");

    tickLabels.forEach((lbl) => {
        labelsRow.append("span").text(lbl);
    });
}

// ==========================================
// 5. MULTI-LINE TRAJECTORY CHART (#act-multi-line)
// ==========================================

function buildMultiLineChart(data) {
    const root = d3.select("#act-multi-line");
    root.html(""); // Clear existing content

    // 1. Determine user's active region (from userState.region or matched via userState.state)
    const stateMatch = data.find((d) => d.state === userState.state && d.region && d.region !== "None");
    const activeRegion = userState.region || (stateMatch ? stateMatch.region : null);

    // 2. Header matching the rest of the dashboard
    const header = root.append("div")
        .attr("class", "act-metric-header");

    header.append("h3")
        .attr("class", "act-metric-title")
        .text("Total Comp by Class & Region");

    // 3. Compact inline legend
    const legend = root.append("div")
        .attr("class", "act-line-legend");

    if (activeRegion) {
        legend.append("span")
            .attr("class", "act-line-legend-item")
            .html(`<span class="act-swatch-region-active"></span> ${activeRegion}`);
    }

    legend.append("span")
        .attr("class", "act-line-legend-item")
        .html(`<span class="act-swatch-region-other"></span> Other regions`);

    legend.append("span")
        .attr("class", "act-line-legend-item")
        .html(`<span class="act-swatch-user-dot"></span> You`);

    // 4. Aggregate average total_comp per (region, yearBucket 1..8)
    const validRows = data.filter(
        (d) =>
            d.region &&
            d.region !== "None" &&
            d.total_comp !== null &&
            !isNaN(d.assoc_year) &&
            d.assoc_year >= 1
    );

    const byRegion = d3.group(validRows, (d) => d.region);
    const seriesList = [];

    byRegion.forEach((rows, regionName) => {
        // Pool all years >= 8 into bucket 8 ("8+")
        const byYear = d3.rollup(
            rows,
            (v) => d3.mean(v, (d) => d.total_comp),
            (d) => Math.min(8, Math.round(d.assoc_year))
        );

        const points = d3.range(1, 9)
            .map((yr) => ({
                year: yr,
                avg: byYear.has(yr) ? byYear.get(yr) : null
            }))
            .filter((pt) => pt.avg !== null);

        if (points.length > 0) {
            seriesList.push({
                region: regionName,
                isActive: regionName === activeRegion,
                points
            });
        }
    });

    // Sort so the highlighted user region is drawn last (on top of gray lines)
    seriesList.sort((a, b) => Number(a.isActive) - Number(b.isActive));

    // 5. Set up SVG scales & axes
    const svgWrap = root.append("div")
        .attr("class", "act-line-svg-wrap");

    const width = 240;
    const height = 148;
    const margin = { top: 14, right: 12, bottom: 20, left: 32 };

    const xScale = d3.scaleLinear()
        .domain([1, 8])
        .range([margin.left, width - margin.right]);

    // Include both regional averages and user's own total_comp in Y domain
    const allAvgs = seriesList.flatMap((s) => s.points.map((p) => p.avg));
    if (userState.total_comp !== null && !isNaN(userState.total_comp)) {
        allAvgs.push(userState.total_comp);
    }

    const yMin = Math.floor((d3.min(allAvgs) ?? 0) / 50000) * 50000;
    const yMax = Math.ceil((d3.max(allAvgs) ?? 400000) / 50000) * 50000;

    const yScale = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([height - margin.bottom, margin.top]);

    const svg = svgWrap.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // Horizontal gridlines + Left Y-Axis
    const yTicks = yScale.ticks(4);
    yTicks.forEach((t) => {
        svg.append("line")
            .attr("class", "act-line-gridline")
            .attr("x1", margin.left)
            .attr("x2", width - margin.right)
            .attr("y1", yScale(t))
            .attr("y2", yScale(t));
    });

    const yAxis = d3.axisLeft(yScale)
        .tickValues(yTicks)
        .tickSize(3)
        .tickFormat((d) => formatK(d));

    svg.append("g")
        .attr("class", "act-axis")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(yAxis);

    // Bottom X-Axis (1 through 8+)
    const xAxis = d3.axisBottom(xScale)
        .tickValues([1, 2, 3, 4, 5, 6, 7, 8])
        .tickSize(3)
        .tickFormat((d) => (d === 8 ? "8+" : `${d}`));

    svg.append("g")
        .attr("class", "act-axis")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(xAxis);

    // 6. Draw region lines
    const lineGenerator = d3.line()
        .x((d) => xScale(d.year))
        .y((d) => yScale(d.avg))
        .curve(d3.curveMonotoneX);

    let tooltip = d3.select("body").select(".act-map-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("class", "act-map-tooltip");
    }

    svg.selectAll("path.act-region-line")
        .data(seriesList)
        .enter()
        .append("path")
        .attr("class", (d) => (d.isActive ? "act-region-line active" : "act-region-line"))
        .attr("d", (d) => lineGenerator(d.points))
        .on("mousemove", function (event, d) {
            d3.select(this).raise();
            const yr1 = d.points[0];
            const yrLast = d.points[d.points.length - 1];
            tooltip
                .style("opacity", 1)
                .style("left", `${event.clientX + 12}px`)
                .style("top", `${event.clientY - 28}px`)
                .html(
                    `<strong>${d.region}</strong>${d.isActive ? " (Your region)" : ""}<br>` +
                    `Yr ${yr1.year === 8 ? "8+" : yr1.year}: <strong>${formatK(yr1.avg)}</strong> → ` +
                    `Yr ${yrLast.year === 8 ? "8+" : yrLast.year}: <strong>${formatK(yrLast.avg)}</strong>`
                );
        })
        .on("mouseleave", function () {
            tooltip.style("opacity", 0);
            svg.selectAll("path.act-region-line.active").raise();
        });

    // 7. Plot user's own (assoc_year, total_comp) benchmark dot + label
    if (
        userState.assoc_year >= 1 &&
        userState.total_comp !== null &&
        !isNaN(userState.total_comp)
    ) {
        const ux = xScale(Math.min(8, userState.assoc_year));
        const uy = yScale(userState.total_comp);

        svg.append("circle")
            .attr("class", "act-user-point")
            .attr("cx", ux)
            .attr("cy", uy)
            .attr("r", 3.8);

        const nearTop = uy < margin.top + 12;
        svg.append("text")
            .attr("class", "act-user-point-label")
            .attr("x", ux)
            .attr("y", nearTop ? uy + 12 : uy - 6)
            .attr("text-anchor", ux > width - margin.right - 18 ? "end" : "middle")
            .text(formatK(userState.total_comp));
    }
}

// Initialize on load
initDashboard();