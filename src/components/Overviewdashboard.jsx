
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import Papa from "papaparse";
import vendorsUrl from "../assets/vendors.csv";
import productsUrl from "../assets/products.csv";
import feesUrl from "../assets/fees.csv";
// at the top of OverviewDashboard.jsx
import {
    Box, Paper, Typography, Table, TableHead, TableRow, TableCell,
    TableBody, IconButton, Popover, Button, Select, MenuItem
  } from "@mui/material";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useNavigate } from "react-router-dom";
  import FilterListIcon from "@mui/icons-material/FilterList";
  import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList, PieChart, Pie,   Legend
  } from "recharts";
  import { Cell } from "recharts";

export default function OverviewDashboard() {
  const { state } = useLocation();
  const [anchorEl, setAnchorEl] = React.useState({}); // per-column popovers
  const openFilter = (col, e) => setAnchorEl((s) => ({ ...s, [col]: e.currentTarget }));
  const closeFilter = (col) => setAnchorEl((s) => ({ ...s, [col]: null }));
  const baseRows = Array.isArray(state?.rows) ? state.rows : [];
  const [rows, setRows] = useState([]);
  const navigate = useNavigate();
//   function for the button at the bottom which will go back to the initial uplload page
const goHome = () => {
  
   navigate("/", { replace: true });
};
// function for top10 Sku's we set up a hashmap here for each sku_id with the value being { sku_id, sku_name, total_fee_cents }
  const top10Skus = useMemo(() => {
    const totals = new Map(); // sku_id -> { sku_id, sku_name, total_fee_cents }
  
    for (const r of rows) {
      const sku = String(r?.sku_id ?? "").trim();
      if (!sku) continue;
  
      const fee = parseFloat(r?.fee); // your fee is in cents
      if (!Number.isFinite(fee)) continue;
  
      const prev = totals.get(sku) || { sku_id: sku, sku_name: "", total_fee_cents: 0 };
      prev.total_fee_cents += fee;
  
      // keep first non-empty sku_name we see
      if (!prev.sku_name && r?.sku_name) prev.sku_name = String(r.sku_name);
  
      totals.set(sku, prev);
    }
    console.log('totals',totals)
//   the logic to show the top 10 sku's by fees in descending order
    return Array.from(totals.values())
      .sort((a, b) => b.total_fee_cents - a.total_fee_cents)
      .slice(0, 10);
  }, [rows]);
  

  useEffect(() => {
    if (!baseRows.length) return;

    // load vendors → products → fees, then enrich with simple lookups
    Papa.parse(vendorsUrl, {
      download: true, header: true, skipEmptyLines: true,
      complete: (vendRes) => {
        Papa.parse(productsUrl, {
          download: true, header: true, skipEmptyLines: true,
          complete: (prodRes) => {
            Papa.parse(feesUrl, {
              download: true, header: true, skipEmptyLines: true,
              complete: (feeRes) => {
                const vendors  = Array.isArray(vendRes.data) ? vendRes.data : [];
                const products = Array.isArray(prodRes.data) ? prodRes.data : [];
                const fees     = Array.isArray(feeRes.data)  ? feeRes.data  : [];


                const vendorById    = new Map(vendors.map(v  => [String(v?.vendor_id ?? "").trim(), v]));
                const productBySku  = new Map(products.map(p => [String(p?.sku_id ?? "").trim(), p]));
                const feeByMaterial = new Map(fees.map(f     => [String(f?.material_name ?? "").trim().toLowerCase(), f]));
                const joined = baseRows.map((r) => {
                  // keys
                  const vid = String(r?.vendor_id ?? "").trim();
                  const sid = String(r?.sku_id ?? "").trim();
                  const mat = String(r?.material_name ?? "").trim().toLowerCase();

                  // lookups
                  const v = vendorById.get(vid) || {};
                  const p = productBySku.get(sid) || {};
                  const feeRow = feeByMaterial.get(mat) || {};
            
                  // grams from table (weight_value), with optional oz→g safeguard
                  const unit = String(r?.weight_unit ?? "").toLowerCase();
                  let grams = parseFloat(r?.weight_value);
                  if (unit === "oz" || unit === "ounce" || unit === "ounces") {
                    grams = Number.isFinite(grams) ? grams * 28.3495 : NaN;
                  }

                  // fee inputs from fees.csv
                  const perGram = parseFloat(feeRow.fee_cents_per_gram);
                  const ecoDisc = parseFloat(feeRow.eco_modulation_discount); // 0..1

                  // compute fee in CENTS (round to nearest cent)
                
                  const fee =
                    Number.isFinite(perGram) && Number.isFinite(grams)
                      ? (perGram * grams * (1 - (Number.isFinite(ecoDisc) ? ecoDisc : 0))).toFixed(3)
                      : "";

                  // enrich + drop internal columns
                  const enriched = {
                    ...r,
                    vendor_name: v.vendor_name ?? v.name ?? "",
                    vendor_exempt: v.exempt ?? v.vendor_exempt ?? "",
                    sku_name: p.sku_name ?? p.name ?? "",
                    fee, // ← computed cents
                  };
                  const { errors_warnings, __cellStatus, __cellNote,case_size, ...clean } = enriched;
                  return clean;
                });

                setRows(joined);
              },
              error: () => setRows(baseRows),
            });
          },
          error: () => setRows(baseRows),
        });
      },
      error: () => setRows(baseRows),
    });
  }, [baseRows]);

  // build columns from cleaned rows
  const columns = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => Object.keys(r || {}).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);
// simple per-column filters (sku_id, sku_name, total_fee_cents)
const [filters, setFilters] = React.useState({
    sku_id: "",      // exact match via dropdown
    sku_name: "",    // exact match via dropdown
  });
  
  // options derived from data (unique, sorted)
  const skuOptions = React.useMemo(
    () => Array.from(new Set(top10Skus.map(d => d.sku_id))).sort(),
    [top10Skus]
  );
  const nameOptions = React.useMemo(
    () => Array.from(new Set(top10Skus.map(d => d.sku_name || ""))).filter(Boolean).sort(),
    [top10Skus]
  );
  
  // apply filters
//   for the filters of top 10 SKU's
  const filteredTop10 = React.useMemo(() => {
    return top10Skus.filter(r => {
      const idOK   = filters.sku_id   ? r.sku_id === filters.sku_id : true;
      const nameOK = filters.sku_name ? (r.sku_name || "") === filters.sku_name : true;
      return idOK && nameOK;
    });
  }, [top10Skus, filters]);
  
  
  const chartData = React.useMemo(
    () => filteredTop10.map((d, i) => ({
      ...d,
      idx: i,
      total_fee_dollars: (d.total_fee_cents || 0) / 100
    })),
    [filteredTop10]
  );
  
// getting the grand total for each row 

  const grandTotalCents = React.useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      const v = parseFloat(r?.fee);
      if (Number.isFinite(v)) sum += v;
    }
    return sum.toFixed(3);
  }, [rows]);
  const UI = {
    cardBorderRadius: 3,
    // distinct borders
    tableBorder: "#10b981", 
    tableBg:     "#ecfdf5", 
    chartBorder: "#2563eb", 
    chartBg:     "#eff6ff", 
    
    tableHeaderBg:   "#eef2ff",
    tableHeaderText: "#3730a3",
    barStroke: "#334155",
  };
  const tableBorder  = (typeof UI !== "undefined" && UI.tableBorder) || ""; // emerald-500
const tableBg      = (typeof UI !== "undefined" && UI.tableBg)     || ""; // emerald-50
const headerBg     = (typeof UI !== "undefined" && UI.tableHeaderBg)   || "";
const headerText   = (typeof UI !== "undefined" && UI.tableHeaderText) || "";
  
  const BAR_COLORS = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
    "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
  ];
  const PIE_COLORS = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
    "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
    "#3b82f6","#f59e0b","#10b981","#ef4444","#8b5cf6",
  ];
  
  // 1) group by vendor_id and sum fee (cents)
  const vendorTotals = React.useMemo(() => {
    const m = new Map(); 
    for (const r of rows) {
      const id  = String(r?.vendor_id ?? "").trim();
      if (!id) continue;
      const fee = parseFloat(r?.fee);
      if (!Number.isFinite(fee)) continue;
    //    performing the groupby operation for the fee
      const v = m.get(id) || { vendor_id: id, vendor_name: "", total_fee_cents: 0 };
      v.total_fee_cents += fee;
      if (!v.vendor_name && r?.vendor_name) v.vendor_name = String(r.vendor_name);
      m.set(id, v);
    }
    return Array.from(m.values()).sort((a, b) => b.total_fee_cents - a.total_fee_cents);
  }, [rows]);
  
  // 2) filter state (dropdowns, not free-text)
  const [vendorFilters, setVendorFilters] = React.useState({
    vendor_id: "",
    vendor_name: "",
  });
  
  // 3) dropdown options derived from data
  const vendorIdOptions = React.useMemo(
    () => Array.from(new Set(vendorTotals.map(v => v.vendor_id))).sort(),
    [vendorTotals]
  );
  const vendorNameOptions = React.useMemo(
    () => Array.from(new Set(vendorTotals.map(v => v.vendor_name || ""))).filter(Boolean).sort(),
    [vendorTotals]
  );
  
  // 4) apply filters
  const filteredVendors = React.useMemo(() => {
    return vendorTotals.filter(v => {
      const idOK   = vendorFilters.vendor_id   ? v.vendor_id === vendorFilters.vendor_id : true;
      const nameOK = vendorFilters.vendor_name ? (v.vendor_name || "") === vendorFilters.vendor_name : true;
      return idOK && nameOK;
    });
  }, [vendorTotals, vendorFilters]);
  
  // 5) chart data (dollars for y-axis / labels)
  const vendorPieData = React.useMemo(() => {
    return filteredVendors.map(v => ({
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name || v.vendor_id,
      value_dollars: (v.total_fee_cents || 0) / 100,
      raw_cents: v.total_fee_cents || 0,
    }));
  }, [filteredVendors]);
  if (!baseRows.length) return <div style={{ padding: 12 }}>No rows passed in.</div>;
  if (!rows.length) return <div style={{ padding: 12 }}>Loading…</div>;

  return (
    <>
    <h1 style={{textAlign:"center"}}>Dashboard Summaries for Vendor dashboard</h1>
   
<Paper
  elevation={0}
  sx={{
    p: 2,
    borderRadius: 3,

  }}
>
  <Typography variant="h6" fontWeight={700} gutterBottom>
    Overview Dashboard 
    <Typography component="span" variant="body2" color="text.secondary">
      ({rows.length} rows)
    </Typography>
  </Typography>

  <Paper
    variant="outlined"
    elevation={0}
    sx={{ borderRadius: 2, overflow: "auto" }}
  >
    <Table
      size="small"
      stickyHeader
      sx={{
        "& thead th": {
          bgcolor: headerBg,
        //   color: headerText,
          fontWeight: 700,
          whiteSpace: "nowrap",
        },
        "& td, & th": { py: 1 },
        "& tbody tr:hover": { bgcolor: "#f1f5f9" },
        "& tbody tr:nth-of-type(even)": { bgcolor: "#fafafa" },
      }}
    >
      <TableHead>
        <TableRow>
          {columns.map((c) => (
            <TableCell key={c}>{c}</TableCell>
          ))}
        </TableRow>
      </TableHead>

      <TableBody>
        {rows.map((r, index) => (
          <TableRow key={index}>
            {columns.map((col) => (
              <TableCell key={col} sx={{ whiteSpace: "nowrap" }}>
                {String(r?.[col] ?? "")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Paper>
</Paper>



<br></br>
<Paper
      variant="outlined"
      elevation={0}
      sx={{ borderRadius: 2, overflow: "auto" }}
    >
  <Box
    sx={{
      display: "flex",
      flexDirection: { xs: "column", md: "row" },
      alignItems: "stretch",
      gap: 2,
    }}
  >
    {/* Table column: more prominent */}
    <Box sx={{ flex: { xs: "1 1 auto", md: "3 1 52%" }, minWidth: 320 }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Top 10 SKUs (Filterable)
      </Typography>

      {/* Filters (dropdowns) */}
      <Box sx={{ display: "flex", gap: 2, mb: 1, flexWrap: "wrap" }}>
        <Box sx={{ minWidth: 200 }}>
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            Filter by SKU
          </Typography>
          <Select
            size="small"
            fullWidth
            value={filters.sku_id}
            onChange={(e) => setFilters((f) => ({ ...f, sku_id: e.target.value }))}
            displayEmpty
          >
            <MenuItem value=""><em>All</em></MenuItem>
            {skuOptions.map((id) => <MenuItem key={id} value={id}>{id}</MenuItem>)}
          </Select>
        </Box>

        <Box sx={{ minWidth: 240 }}>
          <Typography variant="caption" sx={{ display: "block", color: "text.secondary" }}>
            Filter by Name
          </Typography>
          <Select
            size="small"
            fullWidth
            value={filters.sku_name}
            onChange={(e) => setFilters((f) => ({ ...f, sku_name: e.target.value }))}
            displayEmpty
          >
            <MenuItem value=""><em>All</em></MenuItem>
            {nameOptions.map((nm) => <MenuItem key={nm} value={nm}>{nm}</MenuItem>)}
          </Select>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={() => setFilters({ sku_id: "", sku_name: "" })}
          sx={{ alignSelf: "flex-end" }}
        >
          Clear Filters
        </Button>
      </Box>

      {/* Table */}
      <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Table
        size="small"
        stickyHeader
        sx={{
          "& thead th": {
            bgcolor: UI.tableHeaderBg,
            color: UI.tableHeaderText,
            fontWeight: 700,
          },
          "& tbody tr:hover": { bgcolor: "#f1f5f9" },
          "& tbody tr:nth-of-type(odd)": { bgcolor: "background.paper" },
          "& tbody tr:nth-of-type(even)": { bgcolor: "#fafafa" },
        }}
      >
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.100" }}>
              <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>SKU</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Total Fee in cents</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTop10.map((row, i) => (
              <TableRow key={row.sku_id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{row.sku_id}</TableCell>
                <TableCell>{row.sku_name || ""}</TableCell>
                <TableCell align="right">{row.total_fee_cents.toFixed(3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>

    {/* Chart column: smaller */}
    <Box sx={{ flex: { xs: "1 1 auto", md: "1 1 34%" }, minWidth: 260 }}>
      {/* <Paper
        variant="outlined"
        elevation={0}
        sx={{ p: 2, borderRadius: 3, borderColor: UI.cardBorderColor, mb: 0 }}
      > */}
       <Paper variant="outlined" elevation={0} sx={{ p: 2, borderRadius: 3 }}>
  <Typography variant="h6" fontWeight={700} gutterBottom>
   Top 10 SKU's bar chart 
  </Typography>
        <Box sx={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 16, left: 0, bottom: 16 }}
              barCategoryGap="40%"
              barGap={7}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sku_id" />
              <YAxis />
              {/* <Tooltip formatter={(v, n) => n === "total_fee_dollars" ? (v.toFixed(3)|| 0) * 100 : v.toFixed(3)} /> */}
              <Tooltip formatter={(v) => (Number(v) * 100).toFixed(3)} />
              <Bar dataKey="total_fee_dollars" name="Total Fee (Cents)" barSize={16}>
                <LabelList
                  dataKey="total_fee_dollars"
                  position="top"
                //   formatter={(v) => (v.toFixed(3) || 0) * 100}
                formatter={(v) => (Number(v) * 100).toFixed(3)}
                />
                {chartData.map((_, i) => (
                  <Cell
                    key={`cell-${i}`}
                    fill={BAR_COLORS[i % BAR_COLORS.length]}
                    stroke={UI.barStroke}
                    strokeWidth={0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Box>
  </Box>
</Paper>


<Paper
      variant="outlined"
      elevation={0}
      sx={{ borderRadius: 2, overflow: "auto" }}
    >
  <Typography variant="h6" fontWeight={700} gutterBottom>
    Vendor Contribution — Total Fees
  </Typography>


  <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
  
    <Box sx={{ flex: 1, minWidth: 320 }}>
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 2 }}>
    <Box sx={{ minWidth: 220 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>Filter by Vendor ID</Typography>
      <Select
        size="small"
        fullWidth
        value={vendorFilters.vendor_id}
        onChange={(e) => setVendorFilters(f => ({ ...f, vendor_id: e.target.value }))}
        displayEmpty
      >
        <MenuItem value=""><em>All</em></MenuItem>
        {vendorIdOptions.map(id => <MenuItem key={id} value={id}>{id}</MenuItem>)}
      </Select>
    </Box>

    <Box sx={{ minWidth: 260 }}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>Filter by Vendor Name</Typography>
      <Select
        size="small"
        fullWidth
        value={vendorFilters.vendor_name}
        onChange={(e) => setVendorFilters(f => ({ ...f, vendor_name: e.target.value }))}
        displayEmpty
      >
        <MenuItem value=""><em>All</em></MenuItem>
        {vendorNameOptions.map(nm => <MenuItem key={nm} value={nm}>{nm}</MenuItem>)}
      </Select>
    </Box>

    <Button
      size="small"
      variant="outlined"
      onClick={() => setVendorFilters({ vendor_id: "", vendor_name: "" })}
      sx={{ alignSelf: "flex-end" }}
    >
      Clear Filters
    </Button>
  </Box>
      <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <Table
        size="small"
        stickyHeader
        sx={{
          "& thead th": {
            bgcolor: UI.tableHeaderBg,
            color: UI.tableHeaderText,
            fontWeight: 700,
          },
          "& tbody tr:hover": { bgcolor: "#f1f5f9" },
          "& tbody tr:nth-of-type(odd)": { bgcolor: "background.paper" },
          "& tbody tr:nth-of-type(even)": { bgcolor: "#fafafa" },
        }}
      >
          <TableHead>
            <TableRow sx={{ bgcolor: "grey.100" }}>
              <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Vendor ID</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Vendor Name</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Total Fee</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredVendors.map((v, i) => (
              <TableRow key={v.vendor_id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{v.vendor_id}</TableCell>
                <TableCell>{v.vendor_name || ""}</TableCell>
                <TableCell align="right">{v.total_fee_cents.toFixed(3)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Paper
      variant="outlined"
      elevation={0}
      sx={{ borderRadius: 2, overflow: "auto" }}
    >
<Paper
  variant="outlined"
  elevation={0}
  sx={{
    my: 3,                 // top/bottom margin — ensures separation
    mx: "auto",
    maxWidth: 520,
    borderRadius: 3,
    
    overflow: "hidden",
  }}
>
  <Box
    sx={{
      p: 2.25,
      bgcolor: "#f8fafc",
    
    }}
  >
    <Typography variant="overline" sx={{ letterSpacing: 1.1, color: "text.secondary" }}>
      Grand Total Fees (cents)
    </Typography>
    <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1, mt: 0.5 }}>
      {Number(grandTotalCents).toFixed(3)}
    </Typography>
    <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
      Across {rows.length.toLocaleString()} rows
    </Typography>
  </Box>
</Paper>
</Paper>
    </Box>

    <Box sx={{ width: { xs: "100%", md: "50%" }, minWidth: 280 }}>
    <Box sx={{ height: 340 }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={vendorPieData}
          dataKey="value_dollars"
          nameKey="vendor_name"
          outerRadius={110}
          labelLine={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
          stroke={UI.barStroke}
          strokeWidth={0.6}
        >
          {vendorPieData.map((_, i) => (
            <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v, n, p) => [p?.payload?.raw_cents.toFixed(3)|| 0, p?.payload?.vendor_name]} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </Box>
   
    </Box>
  </Box>
</Paper>
<Box sx={{ mt: 3, display: "flex", justifyContent: "center" }}>
  <Button
    variant="contained"
    color="primary"
    startIcon={<ArrowBackIcon />}
    onClick={goHome}
  >
    Back to Home
  </Button>
</Box>

</>
  );
}

