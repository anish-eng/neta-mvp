
import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "./Uploadpage.css";
import materialsUrl from "../assets/materials.csv";
import vendorsUrl from "../assets/vendors.csv";
import productsUrl from "../assets/products.csv";
import {
  Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper
} from "@mui/material";
import { useNavigate } from "react-router-dom";

// reusable function to load the csv file from static urls
export function loadCsvFromPublic(url) {

  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,        
      header: true,            
      skipEmptyLines: true,
      delimiter: ",",          
      complete: (result) => {
        
        const errors = Array.isArray(result.errors) ? result.errors : [];
        if (errors.length > 0) {
       
          console.warn("Papa warnings:", errors);
        }
        resolve(result.data || []);
      },
      error: (err) => reject(err),
    });
  });
}

/** Normalize unit text to "g" or "oz" when possible when there is a minor error with units - eg- grams->g */
const normalizeUnit = (raw) => {
  if (!raw) return "";
  const unit = String(raw).trim().toLowerCase();
  if (unit === "g" || unit === "gram" || unit === "grams") {
    return "g";}
  if (unit === "oz" || unit === "ounce" || unit === "ounces") {return "oz"

  };

  return unit; // unknown stays as-is
};

/** Safe number parse */


// converting a numbern to NaN value so that empty values dont break the code 
const toNumber = (value) => {
  if (typeof value === "number") {
    return value;
  }

  if (value === null || value === undefined) {
    return NaN;
  }

  const num = parseFloat(String(value).trim());
  return Number.isFinite(num) ? num : NaN;
};

const Uploadpage = () => {
  // User-selected files (max 2)
  const navigate = useNavigate();
  const [selectedFiles, setSelectedFiles] = useState([]);

  // Parsed + validated rows for preview, and the final column list
  const [tableRows, setTableRows] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);

  // User-facing error
  const [uiErrorMessage, setUiErrorMessage] = useState("");

  // Authoritative data
  const [productsRows, setProductsRows] = useState([]);
  const [vendorsRows, setVendorsRows] = useState([]);
  const [materialsRows, setMaterialsRows] = useState([]);

  // setting states for allowed fields like allowed SKU IDs, Vendor ID's etc based on the rule files like materials.csv, fees.csv, etc,
  const [allowedSkuIds, setAllowedSkuIds] = useState(new Set());
  const [allowedVendorIds, setAllowedVendorIds] = useState(new Set());
  const [allowedMaterialNames, setAllowedMaterialNames] = useState(new Set());
  const [allowedCategoryGroups, setAllowedCategoryGroups] = useState(new Set());
  const [materialNameToCategoryGroup, setMaterialNameToCategoryGroup] = useState({});

  /** Load products/vendors/materials once from ../assets every time the page loads */
  useEffect(() => {
    const loadAuthoritativeData = async () => {
      const products = await loadCsvFromPublic(productsUrl);
      const vendors = await loadCsvFromPublic(vendorsUrl);
      const materials = await loadCsvFromPublic(materialsUrl);
    
      setProductsRows(products);
      setVendorsRows(vendors);
      setMaterialsRows(materials);

      //Getting a set of allowed SKU ID's from the parsed excel and csv files
      const skuIdSet = new Set();
      for (let i = 0; i < products.length; i++) {
        const skuId = products[i]?.sku_id;
        if (skuId) skuIdSet.add(String(skuId));
      }
      
      setAllowedSkuIds(skuIdSet);

      const vendorIdSet = new Set();
      for (let i = 0; i < vendors.length; i++) {
        const vendorId = vendors[i]?.vendor_id;
        if (vendorId) vendorIdSet.add(String(vendorId));
      }
      setAllowedVendorIds(vendorIdSet);

      const materialNameSet = new Set();
      const categoryGroupSet = new Set();
      const materialToCategory = {};
      for (let i = 0; i < materials.length; i++) {
        const materialName = materials[i]?.material_name;
        const categoryGroup = materials[i]?.category_group;
        if (materialName) materialNameSet.add(String(materialName));
        if (categoryGroup) categoryGroupSet.add(String(categoryGroup));
        if (materialName && categoryGroup) {
          materialToCategory[String(materialName)] = String(categoryGroup);
        }
      }
    
      setAllowedMaterialNames(materialNameSet);
      setAllowedCategoryGroups(categoryGroupSet);
      setMaterialNameToCategoryGroup(materialToCategory);
    };

    loadAuthoritativeData();
  }, []);

  // handle export csv function - the output table is converted to a csv file- Good to have feature
  const handleExportCsv = () => {
    if (!tableRows?.length || !tableColumns?.length) return;
    const dataMatrix = tableRows.map(row =>
      tableColumns.map(col => row?.[col] ?? "")
    );
    const csv = Papa.unparse({ fields: tableColumns, data: dataMatrix }, { newline: "\r\n" });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `neta_preview_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  /** Method to parse csv file is different to pass Excel file when user enters it */
  const parseCsvFile = async (file) => {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.errors && parsed.errors.length > 0) {
      throw new Error(parsed.errors[0].message || "CSV parse error");
    }
    return parsed.data || [];
  };

  /** Parse Excel file (first sheet) → array of objects */
  const parseExcelFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = workbook.Sheets[firstSheetName];
    const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    return jsonRows || [];
  };
// the key function which normalises the rows and adds the validations
  const validateAndNormalizeVendorRows = (rawRows) => {
    const processedRows = [];
    for (let i = 0; i < rawRows.length; i++) {
      const sourceRow = rawRows[i] || {};
      const workingRow = { ...sourceRow };
      // Remove notes column from display
      if ("notes" in workingRow) {
        delete workingRow.notes;
      }
      // Messages that will be shown in the new errors_warnings column
      const messages = [];

      // Per-cell status and note for rendering (not exported)
      const cellStatusByColumn = {}; 
      const cellNoteByColumn = {};   

      // ----- Validate sku_id, check if the ids obtained from each row is within the allowed set of ids if not then add the error message and change cell status to error -----
      const skuId = workingRow.sku_id ? String(workingRow.sku_id).trim() : "";
      if (!skuId || !allowedSkuIds.has(skuId)) {
        messages.push("Error - invalid sku id");
        cellStatusByColumn["sku_id"] = "error";

        
      }

   // ----- Validate vendorid, check if the ids obtained from each row is within the allowed set of ids,if not then add the error message and change cell status to error -----
      const vendorId = workingRow.vendor_id ? String(workingRow.vendor_id).trim() : "";
      if (!vendorId || !allowedVendorIds.has(vendorId)) {
        messages.push("Error - invalid vendor id");
        cellStatusByColumn["vendor_id"] = "error";

        
      }
     
      // ----- Validate material_name similarly -----
      const materialName = workingRow.material_name
        ? String(workingRow.material_name).trim()
        : "";
      const materialKnown = materialName && allowedMaterialNames.has(materialName);
      if (!materialKnown) {
        messages.push("Error - invalid material name");
        cellStatusByColumn["material_name"] = "error";
        // cellNoteByColumn["material_name"] = "(Error - invalid material name)";
       
      }

      // ----- Validate material_category (+ consistency with material_name)  Here we have used a hashmap to link the material name with its category. We are doing 
      // three kinds of validations here- if the material category itself is invalid, if the category is valid but the material is invalid, or if both the material and category
      // themselves are valid but they are not corresponding to each other based on the materials.csv file
      const materialCategory = workingRow.material_category
        ? String(workingRow.material_category).trim()
        : "";
      const categoryKnown =
        materialCategory && allowedCategoryGroups.has(materialCategory);

      if (!categoryKnown) {
        messages.push("Error - invalid material category");
        cellStatusByColumn["material_category"] = "error";

       
      } else if (materialKnown) {
        const expectedCategory = materialNameToCategoryGroup[materialName];
        if (expectedCategory && materialCategory !== expectedCategory) {
          messages.push(`Error - category mismatch (expected '${expectedCategory}')`);
          cellStatusByColumn["material_category"] = "error";
          
        }
      }

      // ----- Normalize weight units and convert if needed -----
      // normalise the weight- if it is any other unit then just 'g' convert it andmake it a number
      const originalUnit = workingRow.weight_unit;
      const normalizedUnit = normalizeUnit(originalUnit);
      let numericWeight = toNumber(workingRow.weight_value);
       
       if(normalizedUnit!==originalUnit){
        messages.push(`Warning- ${originalUnit} changed to ${normalizedUnit} `);
          cellStatusByColumn["weight_value"] = "warning";
          // cellNoteByColumn["weight_value"] = `(Expected '${originalUnit}')`;
       }
      if (normalizedUnit === "oz" && Number.isFinite(numericWeight)) {
        // Convert to grams and overwrite value + unit
        // const grams = numericWeight * 28.3495;
        workingRow.weight_value = numericWeight * 28.3495;
        workingRow.weight_unit = "g";
       
        messages.push("Warning-Uses ounces; normalize to grams");
        cellStatusByColumn["weight_value"] = "warning";
    
       
      } else {
        // Keep normalized unit if recognized; otherwise leave user input
        workingRow.weight_unit = normalizedUnit || workingRow.weight_unit;
        
      }
      // checking for case_size if case size exists , divide the value of weight_value by the case size and then set the case size to ''. Register it as a warning.
      if(workingRow.case_size){
        workingRow.weight_value=workingRow.weight_value/workingRow.case_size
        workingRow.quantity_basis="unit"
        workingRow.case_size=''
        messages.push("Weight value has been calculated per unit instead of case.");
        cellStatusByColumn["weight_value"] = "warning";


      }

      // ----- Warning: heavy component (>300g) -----
      // after normalising the unit, if the value of weight is greater than 300 g flag it as an anomaly(warning)
      const valueAfter = toNumber(workingRow.weight_value);
      
      const unitAfter = normalizeUnit(workingRow.weight_unit);
      if (unitAfter === "g" && Number.isFinite(valueAfter) && valueAfter > 300) {
        messages.push("Warning - weight value is above 300g");
        cellStatusByColumn["weight_value"] = "warning";
       
      }
      // if weight value is empty after the processing, mark it as an error 
      else if(isNaN(valueAfter)){
        messages.push("Error- weight value cannot be empty");
        cellStatusByColumn["weight_value"] = "error";
       

      }

      // Add the consolidated messages column
      workingRow.errors_warnings = messages.join(" \n ");

      // Attach rendering helpers so that the color coding the error, warning cells can be done accordingly.
     
      workingRow.__cellStatus = cellStatusByColumn;
      workingRow.__cellNote = cellNoteByColumn;
      processedRows.push(workingRow);
    }

    return processedRows;
  };

  /** Build final column list (exclude notes/internal, put errors_warnings last) */
  const buildFinalColumnList = (rowsForTable) => {
    // this function runs a nested loop to build the table structure for each row, it renders the column values 
    const columnNameSet = new Set();
   
    for (let i = 0; i < rowsForTable.length; i++) {
      
      const rowObj = rowsForTable[i];
   
      if (!rowObj) continue;

      const keys = Object.keys(rowObj);
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        // to avoid showing these columns in the final table
        if (key === "notes") continue;
        if (key === "__cellStatus") continue;
        if (key === "__cellNote") continue;
        if (key === "errors_warnings") continue; // add at end
        columnNameSet.add(key);
      }
    }
   
    const orderedColumns = Array.from(columnNameSet);
    orderedColumns.push("errors_warnings");
    return orderedColumns;
  };
  // if any of the tableRows have an error, we cannot let the user proceed to the next screen to see the dashboards.
  const hasErrors = tableRows.some(
    row => row?.__cellStatus && Object.values(row.__cellStatus).includes("error")
  );


  const handleSubmit = async (event) => {
    event.preventDefault();

    setUiErrorMessage("");
    setTableRows([]);
    setTableColumns([]);

    if (selectedFiles.length === 0) {
      setUiErrorMessage("Please choose up to 2 files first.");
      return;
    }

    try {
      // Parse all files
      const combinedRows = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileNameLower = (file?.name || "").toLowerCase();

        if (fileNameLower.endsWith(".csv")) {
          const part = await parseCsvFile(file);
          for (let j = 0; j < part.length; j++) {
            combinedRows.push(part[j]);
          }
        } else if (fileNameLower.endsWith(".xlsx") || fileNameLower.endsWith(".xls")) {
          const part = await parseExcelFile(file);
          console.log("part inside combinedrows function",part)
          for (let j = 0; j < part.length; j++) {
            combinedRows.push(part[j]);
          }
        } else {
          throw new Error(`Unsupported file type: ${file.name}`);
        }
        console.log('combinedrows',combinedRows)
      }

      // Apply your business rules
      const normalizedRows = validateAndNormalizeVendorRows(combinedRows);
      
      // Build columns and save
      const finalColumns = buildFinalColumnList(normalizedRows);
     
      
      setTableColumns(finalColumns);
      setTableRows(normalizedRows);
    } catch (err) {
      setUiErrorMessage(err?.message || String(err));
    }
  };
/** File input: store up to 2 files; parse later on submit - Key assumption here- we only take two files here even if the user gives more, however this can be modified easily */
  const handleFilePick = (event) => {
    setUiErrorMessage("");
    const fileList = event.target.files;
    if (!fileList) {
      setSelectedFiles([]);
      return;
    }
    const firstTwo = Array.from(fileList).slice(0, 2);
    setSelectedFiles(firstTwo);
  };

  return (
    <div className="page">
      <h1 className="title">Neta MVP — Vendor Data Analysis</h1>

      <form onSubmit={handleSubmit} className="card">
        <h2 className="sectionTitle">Upload vendor submissions (up to 2 files)</h2>
        <p className="subtle">Accepts .csv, .xlsx, .xls</p>

        <label className="pickerLabel">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.numbers"
            multiple
            onChange={handleFilePick}
            style={{ display: "none" }}
          />
          <span className="pickerButton">Choose file(s)</span>
          <span className="fileHint">
            {/* display the filenames that were selected as a preview */}
            {selectedFiles.length > 0
              ? selectedFiles.map((f) => f.name).join(" • ")
              : "No files selected yet"}
          </span>
        </label>

        {uiErrorMessage && <div className="error">{uiErrorMessage}</div>}

        <button type="submit" className="submitButton">Upload &amp; Preview</button>
      </form>

    


      {tableRows.length > 0 && (
  <div className="tableWrap">
    <div className="tableHeader">
      Preview ({tableRows.length.toLocaleString()} rows)
    </div>
{/* actual table component showing the preview of the rows and columns with the validation */}
    <TableContainer component={Paper} elevation={1} sx={{ borderRadius: 2, mt: 1 }}>
      <Table aria-label="preview table" size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: "grey.100" }}>
            {tableColumns.map((colName) => (
              <TableCell key={colName} sx={{ fontWeight: 700 }}>
                {colName}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>

        <TableBody>
          {/* important assumption we are showing only the first 200 rows of the table , but this could be modified to show more if needed */}
          {tableRows.slice(0, 200).map((rowObj, rowIdx) => (
            <TableRow key={rowIdx} hover>
              {tableColumns.map((colName) => {
               
                // checking what the status of each specific cell of the table to color code later
                const status = rowObj.__cellStatus?.[colName]; // "error" | "warning" | undefined
                const note = rowObj.__cellNote?.[colName] || "";

                // base value
                let displayValue = rowObj[colName];

              // if the cell error_warinings includes the word "Error"- we show it be red
              // if the cell error_warnings includes the word "Warning"- we show it to be orange
              // If everything is valid , we show it as green
                let visualStatus
                if (colName === "errors_warnings") {
                  const msg = String(rowObj.errors_warnings || "");
                  const hasError = msg.includes("Error");
                  const hasWarning = msg.includes("Warning");
                  visualStatus = hasError ? "error" : hasWarning ? "warning" : "valid";
                  displayValue = msg || "Valid";
                } else if (status === "error" || status === "warning") {
                  visualStatus = status;
                }

          //  this is the rule which declares the color of the cell depnding on its status.

                const sxByStatus =
  visualStatus === "error"
    ? {
        bgcolor: "error.light",
        color: "grey.900", // softer dark text
        fontWeight: colName === "errors_warnings" ? 500 : 400,
      }
    : visualStatus === "warning"
    ? {
        bgcolor: "warning.light",
        color: "grey.900",
        fontWeight: colName === "errors_warnings" ? 500 : 400,
      }
    : visualStatus === "valid"
    ? {
        bgcolor: "success.light",
        color: "grey.900",
        fontWeight: colName === "errors_warnings" ? 500 : 400,
      }
    : {};

                return (
                  <TableCell
                    key={colName}
                    sx={{
                      whiteSpace: colName === "errors_warnings" ? "pre-line" : "normal",
                      ...sxByStatus,
                    }}
                  >
                    {String(displayValue ?? "")}
                    {note ? <em style={{ marginLeft: 6 }}>{note}</em> : null}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>

    <div className="belowTable">
      {hasErrors ? (
        <div className="banner error">
          There are errors in the table. Please fix them before continuing.
        </div>
      ) : (
        <div className="banner ok">No blocking errors found.</div>
      )}
 {/* the next button which allows the user to move on to the dashboard summary */}
      <button
        className="nextBtn"
        disabled={hasErrors || tableRows.length === 0}
        onClick={() => navigate("/overview", { state: { rows: tableRows } })}
>
       
        Next
      </button>
      {/* button that allows the user to export to a csv file */}
      <button className="exportBtn" onClick={handleExportCsv}>Export CSV</button>
    </div>
{/* If the number of rows are more than 200, we only show the first 200 */}
    {tableRows.length > 200 && (
      <div className="note">Showing only the first 200 rows.</div>
    )}
  </div>
)}
      </div>
      );
      };

    export default Uploadpage;
