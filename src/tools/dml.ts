import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DMLResult, SalesforceField } from "../types/salesforce.js";
import { promptUser } from "../utils/interaction.js";

export const DML_RECORDS: Tool = {
  name: "salesforce_dml_records",
  description: `Perform data manipulation operations on Salesforce records:
  - insert: Create new records
  - update: Modify existing records (requires Id)
  - delete: Remove records (requires Id)
  - upsert: Insert or update based on external ID field
  Examples: Insert new Accounts, Update Case status, Delete old records, Upsert based on custom external ID`,
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["insert", "update", "delete", "upsert"],
        description: "Type of DML operation to perform"
      },
      objectName: {
        type: "string",
        description: "API name of the object"
      },
      records: {
        type: "array",
        items: { type: "object" },
        description: "Array of records to process"
      },
      externalIdField: {
        type: "string",
        description: "External ID field name for upsert operations",
        optional: true
      },
      guidedInput: {
        type: "boolean",
        description: "Whether to use guided input for creating records (especially useful for Case records)",
        optional: true
      }
    },
    required: ["operation", "objectName", "records"]
  }
};

export async function guidedCaseCreation(conn: any): Promise<Record<string, any>> {
  const accountSearchString = await promptUser("Enter a search string to filter accounts:");
  const accounts = await conn.sobject("Account").find({ Name: { $like: `%${accountSearchString}%` } }, ["Id", "Name"]);
  if (accounts.length === 0) throw new Error("No accounts found for the given search string.");
  const accountChoices = accounts.map((acc: any, idx: number) => `${idx + 1}. ${acc.Name}`).join("\n");
  const accountSelection = parseInt(await promptUser(`Select an account:\n${accountChoices}`), 10);
  const selectedAccount = accounts[accountSelection - 1];
  if (!selectedAccount) throw new Error("Invalid account selection.");

  // Step 2: Select a contact linked to the account
  const contacts = await conn.sobject("Contact").find({ AccountId: selectedAccount.Id }, ["Id", "Name"]);
  let selectedContact = null;
  if (contacts.length > 0) {
    const contactChoices = contacts.map((con: any, idx: number) => `${idx + 1}. ${con.Name}`).join("\n");
    const contactSelection = parseInt(await promptUser(`Select a contact (or press Enter to skip):\n${contactChoices}`), 10);
    selectedContact = contacts[contactSelection - 1] || null;
  }

  // Step 3: Select Type and Status
  const caseTypes = await conn.sobject("Case").describe().then((desc: any) => desc.fields.find((f: any) => f.name === "Type").picklistValues);
  const typeChoices = caseTypes.map((type: any, idx: number) => `${idx + 1}. ${type.label}`).join("\n");
  const typeSelection = parseInt(await promptUser(`Select a case type:\n${typeChoices}`), 10);
  const selectedType = caseTypes[typeSelection - 1]?.value;

  const caseStatuses = await conn.sobject("Case").describe().then((desc: any) => desc.fields.find((f: any) => f.name === "Status").picklistValues);
  const statusChoices = caseStatuses.map((status: any, idx: number) => `${idx + 1}. ${status.label}`).join("\n");
  const statusSelection = parseInt(await promptUser(`Select a case status:\n${statusChoices}`), 10);
  const selectedStatus = caseStatuses[statusSelection - 1]?.value;

  // Step 4: Confirm and return case details
  const caseDetails = {
    AccountId: selectedAccount.Id,
    ContactId: selectedContact?.Id || undefined,
    Type: selectedType,
    Status: selectedStatus,
  };
  const confirmation = await promptUser(`Confirm case details:\n${JSON.stringify(caseDetails, null, 2)}\n(Y to confirm, N to edit):`);
  if (confirmation.toLowerCase() !== "y") throw new Error("Case creation canceled by user.");

  return caseDetails;
}

export async function advancedGuidedCaseCreation(conn: any): Promise<Record<string, any>> {
  // Get Case object metadata to determine required fields
  const caseDescribe = await conn.sobject("Case").describe();
  const requiredFields = caseDescribe.fields.filter((field: any) => 
    !field.nillable && 
    !field.defaultedOnCreate && 
    field.createable && 
    field.name !== 'CaseNumber' // Skip CaseNumber as it's system-generated
  );
  
  const caseRecord: Record<string, any> = {};
  
  // Handle Account selection first
  const accountSearchString = await promptUser("Enter a search string to filter accounts:");
  const accounts = await conn.sobject("Account").find({ Name: { $like: `%${accountSearchString}%` } }, ["Id", "Name"]);
  
  if (accounts.length === 0) {
    throw new Error("No accounts found matching your search criteria. Please try again with a different search term.");
  }
  
  let selectedAccount;
  if (accounts.length === 1) {
    selectedAccount = accounts[0];
    console.log(`Using the only matching account: ${selectedAccount.Name}`);
  } else {
    const accountChoices = accounts.map((acc: any, idx: number) => `${idx + 1}. ${acc.Name}`).join("\n");
    const accountSelection = parseInt(await promptUser(`Select an account:\n${accountChoices}`), 10);
    
    if (isNaN(accountSelection) || accountSelection < 1 || accountSelection > accounts.length) {
      throw new Error("Invalid account selection. Please enter a valid number from the list.");
    }
    
    selectedAccount = accounts[accountSelection - 1];
  }
  
  caseRecord.AccountId = selectedAccount.Id;
  
  // Handle Contact selection if needed
  const contacts = await conn.sobject("Contact").find({ AccountId: selectedAccount.Id }, ["Id", "Name"]);
  
  if (contacts.length > 0) {
    const contactChoices = contacts.map((con: any, idx: number) => `${idx + 1}. ${con.Name}`).join("\n");
    const contactPrompt = `Select a contact for this case (or press Enter to skip):\n${contactChoices}`;
    const contactSelectionInput = await promptUser(contactPrompt);
    
    if (contactSelectionInput.trim() !== "") {
      const contactSelection = parseInt(contactSelectionInput, 10);
      
      if (!isNaN(contactSelection) && contactSelection >= 1 && contactSelection <= contacts.length) {
        caseRecord.ContactId = contacts[contactSelection - 1].Id;
      }
    }
  }
  
  // If no contact is selected, prompt for Web Email and Web Name
  if (!caseRecord.ContactId) {
    console.log("\nNo contact selected. Please provide web contact information:");
    
    let webEmail = "";
    while (webEmail.trim() === "") {
      webEmail = await promptUser("Web Email (required):");
      if (webEmail.trim() === "") {
        console.log("Web Email is required when no contact is selected. Please enter a valid email address.");
      }
    }
    caseRecord.SuppliedEmail = webEmail;
    
    let webName = "";
    while (webName.trim() === "") {
      webName = await promptUser("Web Name (required):");
      if (webName.trim() === "") {
        console.log("Web Name is required when no contact is selected. Please enter a name.");
      }
    }
    caseRecord.SuppliedName = webName;
  }
  
  // Add common required fields that might not be in the requiredFields list
  // Subject is almost always required
  if (!caseRecord.Subject) {
    caseRecord.Subject = await promptUser("Enter a subject for this case:");
  }
  
  // Description is often needed
  if (!caseRecord.Description) {
    caseRecord.Description = await promptUser("Enter a description for this case (press Enter to skip):");
    if (caseRecord.Description.trim() === "") {
      delete caseRecord.Description;
    }
  }
  
  // Origin is often required
  if (!caseRecord.Origin) {
    const originField = caseDescribe.fields.find((f: any) => f.name === 'Origin');
    if (originField && originField.picklistValues && originField.picklistValues.length > 0) {
      const choices = originField.picklistValues.map((item: any, idx: number) => `${idx + 1}. ${item.label || item.value}`).join("\n");
      const selection = parseInt(await promptUser(`Select an origin:\n${choices}`), 10);
      
      if (!isNaN(selection) && selection >= 1 && selection <= originField.picklistValues.length) {
        caseRecord.Origin = originField.picklistValues[selection - 1].value;
      }
    }
  }
  
  // Status is often required
  if (!caseRecord.Status) {
    const statusField = caseDescribe.fields.find((f: any) => f.name === 'Status');
    if (statusField && statusField.picklistValues && statusField.picklistValues.length > 0) {
      const choices = statusField.picklistValues.map((item: any, idx: number) => `${idx + 1}. ${item.label || item.value}`).join("\n");
      const selection = parseInt(await promptUser(`Select a status:\n${choices}`), 10);
      
      if (!isNaN(selection) && selection >= 1 && selection <= statusField.picklistValues.length) {
        caseRecord.Status = statusField.picklistValues[selection - 1].value;
      }
    }
  }
  
  // Priority is often required
  if (!caseRecord.Priority) {
    const priorityField = caseDescribe.fields.find((f: any) => f.name === 'Priority');
    if (priorityField && priorityField.picklistValues && priorityField.picklistValues.length > 0) {
      const choices = priorityField.picklistValues.map((item: any, idx: number) => `${idx + 1}. ${item.label || item.value}`).join("\n");
      const selection = parseInt(await promptUser(`Select a priority:\n${choices}`), 10);
      
      if (!isNaN(selection) && selection >= 1 && selection <= priorityField.picklistValues.length) {
        caseRecord.Priority = priorityField.picklistValues[selection - 1].value;
      }
    }
  }
  
  // Process other required fields
  for (const field of requiredFields) {
    // Skip fields we've already handled
    if (field.name === 'AccountId' || field.name === 'ContactId' || 
        field.name === 'Subject' || field.name === 'Description' || 
        field.name === 'Origin' || field.name === 'Status' || 
        field.name === 'Priority' || caseRecord[field.name] !== undefined) {
      continue;
    }
    
    // Handle reference fields (lookups)
    if (field.type === 'reference' && field.referenceTo && field.referenceTo.length > 0) {
      const objectName = field.referenceTo[0];
      const searchString = await promptUser(`Enter a search string to find ${field.label}:`);
      
      try {
        const records = await conn.sobject(objectName).find({ Name: { $like: `%${searchString}%` } }, ["Id", "Name"]);
        
        if (records.length === 0) {
          throw new Error(`No ${objectName} records found matching your search criteria.`);
        }
        
        if (records.length === 1) {
          caseRecord[field.name] = records[0].Id;
          console.log(`Using the only matching ${objectName}: ${records[0].Name}`);
        } else {
          const choices = records.map((rec: any, idx: number) => `${idx + 1}. ${rec.Name}`).join("\n");
          const selection = parseInt(await promptUser(`Select a ${field.label}:\n${choices}`), 10);
          
          if (isNaN(selection) || selection < 1 || selection > records.length) {
            throw new Error(`Invalid ${objectName} selection. Please enter a valid number from the list.`);
          }
          
          caseRecord[field.name] = records[selection - 1].Id;
        }
      } catch (error) {
        console.error(`Error finding ${objectName} records:`, error);
        throw new Error(`Unable to find ${field.label} records. Please try again.`);
      }
      
      continue;
    }
    
    // Handle picklist fields
    if (field.type === 'picklist' && field.picklistValues && field.picklistValues.length > 0) {
      const choices = field.picklistValues.map((item: any, idx: number) => `${idx + 1}. ${item.label || item.value}`).join("\n");
      const selection = parseInt(await promptUser(`Select a ${field.label}:\n${choices}`), 10);
      
      if (isNaN(selection) || selection < 1 || selection > field.picklistValues.length) {
        throw new Error(`Invalid ${field.label} selection. Please enter a valid number from the list.`);
      }
      
      caseRecord[field.name] = field.picklistValues[selection - 1].value;
      continue;
    }
    
    // Handle other field types with appropriate prompts
    let fieldValue;
    
    switch (field.type) {
      case 'boolean':
        const boolResponse = await promptUser(`${field.label} (true/false):`);
        fieldValue = boolResponse.toLowerCase() === 'true';
        break;
        
      case 'date':
        fieldValue = await promptUser(`${field.label} (YYYY-MM-DD):`);
        break;
        
      case 'datetime':
        fieldValue = await promptUser(`${field.label} (YYYY-MM-DDTHH:MM:SS):`);
        break;
        
      case 'double':
      case 'int':
      case 'currency':
        const numResponse = await promptUser(`${field.label}:`);
        fieldValue = parseFloat(numResponse);
        if (isNaN(fieldValue)) {
          throw new Error(`Invalid number format for ${field.label}`);
        }
        break;
        
      default:
        fieldValue = await promptUser(`${field.label}:`);
    }
    
    caseRecord[field.name] = fieldValue;
  }
  
  // Show summary and confirm
  console.log("\nCase Details Summary:");
  for (const [key, value] of Object.entries(caseRecord)) {
    const fieldMeta = caseDescribe.fields.find((f: any) => f.name === key);
    const label = fieldMeta ? fieldMeta.label : key;
    console.log(`${label}: ${value}`);
  }
  
  const confirmation = await promptUser("\nCreate this case? (Y/N):");
  if (confirmation.toLowerCase() !== 'y') {
    throw new Error("Case creation canceled by user.");
  }
  
  return caseRecord;
}

export interface DMLArgs {
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  objectName: string;
  records: Record<string, any>[];
  externalIdField?: string;
  guidedInput?: boolean;
}

export async function handleDMLRecords(conn: any, args: DMLArgs): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  const { operation, objectName, records, externalIdField, guidedInput } = args;

  let result: DMLResult | DMLResult[];
  
  switch (operation) {
    case 'insert':
      if (objectName === 'Case') {
        // Always use advanced guided case creation for Case objects
        const caseDetails = await advancedGuidedCaseCreation(conn);
        result = await conn.sobject(objectName).create([caseDetails]);
      } else {
        result = await conn.sobject(objectName).create(records);
      }
      break;
    case 'update':
      result = await conn.sobject(objectName).update(records);
      break;
    case 'delete':
      result = await conn.sobject(objectName).destroy(records.map(r => r.Id));
      break;
    case 'upsert':
      if (!externalIdField) {
        throw new Error('externalIdField is required for upsert operations');
      }
      result = await conn.sobject(objectName).upsert(records, externalIdField);
      break;
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }

  // Format DML results
  const results = Array.isArray(result) ? result : [result];
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;

  let responseText = `${operation.toUpperCase()} operation completed.\n`;
  responseText += `Processed ${results.length} records:\n`;
  responseText += `- Successful: ${successCount}\n`;
  responseText += `- Failed: ${failureCount}\n`;

  // Include record IDs for successful operations
  if (successCount > 0) {
    responseText += '\nSuccessful Records:\n';
    results.forEach((r: DMLResult, idx: number) => {
      if (r.success && r.id) {
        responseText += `Record ${idx + 1} - ID: ${r.id}\n`;
      }
    });
  }
  responseText += '\n';

  if (failureCount > 0) {
    responseText += 'Errors:\n';
    results.forEach((r: DMLResult, idx: number) => {
      if (!r.success && r.errors) {
        responseText += `Record ${idx + 1}:\n`;
        if (Array.isArray(r.errors)) {
          r.errors.forEach((error) => {
            responseText += `  - ${error.message}`;
            if (error.statusCode) {
              responseText += ` [${error.statusCode}]`;
            }
            if (error.fields && error.fields.length > 0) {
              responseText += `\n    Fields: ${error.fields.join(', ')}`;
            }
            responseText += '\n';
          });
        } else {
          // Single error object
          const error = r.errors;
          responseText += `  - ${error.message}`;
          if (error.statusCode) {
            responseText += ` [${error.statusCode}]`;
          }
          if (error.fields) {
            const fields = Array.isArray(error.fields) ? error.fields.join(', ') : String(error.fields);
            responseText += `\n    Fields: ${fields}`;
          }
          responseText += '\n';
        }
      }
    });
  }

  return {
    content: [{
      type: "text",
      text: responseText
    }],
    isError: false,
  };
}
