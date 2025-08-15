**Name- Neta Engineering Take home Assignment MVP**

By-Anish

Main Tech Stack Used- React.js for the main website and the frontend flows

For xlsx, csv file parsing on the frontend- **Papaparse**

For rendering tables, frontend UI components- **@MUI-Material UI library**

Other miscellaneous styling- **Vanilla CSS**

Hosting- **Google firebase**

Project link-** https://netamvp-8123.web.app/**


**How to start-**-

Navigate to the project folder neta-mvp within and run the command "npm start"

----------------------------------------------------------

**Overall Architecture-** 

Project divided into two logical parts- 

**Part 1- Data pre-processing and validation**(this involves checking the vendor's uploaded files, checking the correct units, sku_id, material_name, etc and giving them errors and warnings if there are any errors ).

Note: The user is not allowed to move to the next part of the project if the initial file upload is not error-free.

**Part 2- The Dashboard summaries** for the vendor dashboard showing the required statistics like-

a. Top-10 SKU'S by fees with a filterable table and a supporting bar graph for enhanced visuals and accessibility

b. Vendor-wise contributions of the total fees with a filterable table and also a supporting pie-chart for accessibility

c. Grand total fees combining all the vendors(in cents) displayed as a card

----------------------------------------------------------

**1. Data Flows**-

For the first part of the project(preprocessing)-
This is for the part when the user uploads the initial vendor file

**a. interface VendorSubmissionRow **{

  vendor_id: string;
  
  sku_id: string;   
  
  material_name: string;     
  
  material_category: string;   
  
  weight_value: number | string; 
  
  weight_unit: string;    
  
  case_size: number | string; 
  
  quantity_basis: string;     
  
  errors_warnings:{ string; 
  
  __cellStatus?: string; 
  
  __cellNote?:   string  
  }
}


For part 2 when  we make the data dashboards the following data models are used-

**b.interface Product** {

  sku_id: string;        
  
  sku_name?: string; 
  
  vendor_id?: string; 
  
  category:string 
}


**c. interface Vendor** {

  vendor_id: string;   

  vendor_name?: string;
  
  exempt?: string | boolean;   
  
}


**d. interface FeeRow** {

  material_name: string;   
  
  material_category:string;
  
  fee_cents_per_gram: string|number;  

  eco_modulation_discount?: string|number;
}


----------------------------------------------------------
**2. Data Ingestion and Validation**

For part 1 of the project:

**a. Reading files clearly**- Allowing file upload and reading of csv, xlsx files using separate functions.

Assumption- Currently reads only first two files as input. Could be extended to read multiple files in the future. 

**b**. **Validations**- Following validations are done

   ****** 1. Error Messages- ******
    Following checks are done and appropriate messages given
    a. vendor_id must be belonging to vendors.csv
    
    b. sku_id must belong to products.csv
    
    c. material_name must belong to materials.csv
    
    d. material_category must belong to materials.csv
    
    e. material_category corresponding to material_name must be correct
    
    f. weight_value from the given file should not be missing.
    
    g. if quantity_basis=case then case_size should not be 0
    
   ** **2. Warning messages-****
    a. If weight unit is ounce- conversion done implicly to grams and warning message given to user
    
    b. If weight_value is greater than 300, warning is given- does not affect calculations.
    
    c. If quantity_basis=case, weight_value is divided by case_size implicitly and unit is changed to g from case. Warning given to user.
    
    d. if weight_unit is something close to g like gram, grams, etc then it is implicitly changed to g and warning is given.

----------------------------------------------------------
**3. Fee logic-** For the fee calculation and displaying the required dashboards, the following processing needs to be done-

    a. The output table generated from step_1 will be treated as an input table for part 2 of the project. We perform a LEFT JOIN operation of this table first with the vendors.csv table using the common field vendor_id to extract vendor_name details for the input.

    b. Similarly, we perform a LEFT JOIN of the updated input from part a with the products.csv table using the sku_id as the common field and extract the sku_name

    c. To get the fees column, for each row of the updated table after part b, we use the material_name to perform a lookup in fees.csv to get the fees_cents_per_gram and the eco_modulation_discount field

    d. The following formula is applied to get the fees computation( this is the value in the fee column)-
    fee_cents_per_gram * grams * (1 – eco_modulation_discount if present). 

----------------------------------------------------------

**4. Dashboard aggregation logic-**

  a. Top-10 SKU's- Using the input table from part 3d, we perform an  groupby operation using sku_id to get the total fees per sku and add the total fees subtotal for various components and display only the top-10 sku's. Filter by option as well as bar chart displaying the top-10 sku's has been provided.

  b. Vendor totals- To display the vendor totals , using input table from part 3d, we perform a groupby operation using vendor_id to get the total fees for all the different components for a particular vendor and we display this as a table as well as pie chart, along with the filter option.
  
   c. Grand total- Addition of the fees column for the two vendors gives us the grand total which is displayed as a card.


----------------------------------------------------------
**
**5. UX considerations****

a. I have two screens only instead of the recommended 3-4, to give the user flexbility to reupload the files incase of any error and to prevent 
unnecessary back and forth across many url's and pages

b. I have provided an export to csv feature in the main page for convenience of the user. This allows the user to download the input file with the feedback of errors/warning and the conversions performed.

c. Have provided pie chart and a bar graph for enhanced visualisation and accesibility.
d. Provided a go back button on the second page for more intuitive navigation.


----------------------------------------------------------
**6. Assumptions-**
a.  All fees shown is in cents and rounded to 3 decimal places  

b. The EXEMPT field has not been used - as I wasnt clear on the usage

c. Only the first two files that the user uploads in the first page will be considered.

d. Only the first 200 rows of the initial uploaded field will be shown, combining both the files. 


**Part b- **

1. a. I would implement the what-if simulation feature next, due to shortage of time I couldnt do it this time.
   
b. AI-based algorithm for identifying the corrections for name errors. For example if the field name was Corrugated Cardboard, and the user types something close like 'hardboard' or something, the user should be suggested, did you mean 'corrugated cardboard'?

3. Processing large files as the file size increases could cause performance issues. I would implement caching or some other mechanism to keep
track of already seen/duplicate files so it doesnt have to be processed again. Also some fields are duplicated in the tables such as material category, making it prone to errors.

**4. Time-taken-**

**Validation-preprocessing-** 1.5 hours
Dashboard display and join/groupby operations and refinement-2 hours

**Documentation and deployment-** 0.5 hours-

**Additional support **- I spent a lot of time trying to use external libraries for join/groupby operations
however it was very error-prone and I spent long trying to figure it out. I later decided to implement it from scratch, but much later, this was 
not the most efficient and I will improve on it. 

I would have preferred more clarity in the documentation regarding understanding concept and terminology of sku_id, vendor_id 
and how it is to be used in the context of this problem. Several components sharing the same sku_id was confusing to me. 


----------------------------------------------------------



















