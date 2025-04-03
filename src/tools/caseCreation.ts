import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createSalesforceConnection } from "../utils/connection.js";

// Tool for getting case creation metadata (required fields, picklist values, etc.)
export const GET_CASE_METADATA: Tool = {
  name: "salesforce_get_case_metadata",
  description: "Get metadata about Case object including required fields, picklist values, and related objects needed for case creation",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

// Tool for searching accounts to associate with a case
export const SEARCH_ACCOUNTS: Tool = {
  name: "salesforce_search_accounts",
  description: "Search for accounts to associate with a case",
  inputSchema: {
    type: "object",
    properties: {
      searchTerm: {
        type: "string",
        description: "Search term to filter accounts by name"
      }
    },
    required: ["searchTerm"]
  }
};

// Tool for searching contacts related to an account
export const SEARCH_CONTACTS: Tool = {
  name: "salesforce_search_contacts",
  description: "Search for contacts related to an account",
  inputSchema: {
    type: "object",
    properties: {
      accountId: {
        type: "string",
        description: "ID of the account to find contacts for"
      }
    },
    required: ["accountId"]
  }
};

// Tool for creating a case with all required information
export const CREATE_CASE: Tool = {
  name: "salesforce_create_case",
  description: "Create a new case with the provided information",
  inputSchema: {
    type: "object",
    properties: {
      subject: {
        type: "string",
        description: "Subject of the case"
      },
      description: {
        type: "string",
        description: "Detailed description of the issue"
      },
      priority: {
        type: "string",
        description: "Priority of the case (e.g., High, Medium, Low)"
      },
      status: {
        type: "string",
        description: "Status of the case (e.g., New, Working, Escalated)"
      },
      accountId: {
        type: "string",
        description: "ID of the account associated with the case"
      },
      contactId: {
        type: "string",
        description: "ID of the contact associated with the case (optional)",
        optional: true
      },
      caseType: {
        type: "string",
        description: "Type of the case (e.g., Question, Problem, Feature Request)",
        optional: true
      },
      origin: {
        type: "string",
        description: "Origin of the case (e.g., Email, Phone, Web)",
        optional: true
      },
      // Add other common case fields as needed
      additionalFields: {
        type: "object",
        description: "Any additional fields to set on the case",
        optional: true
      }
    },
    required: ["subject", "description", "priority", "status", "accountId"]
  }
};

// Tool for getting picklist values for a specific field
export const GET_PICKLIST_VALUES: Tool = {
  name: "salesforce_get_picklist_values",
  description: "Get picklist values for a specific field on the Case object",
  inputSchema: {
    type: "object",
    properties: {
      fieldName: {
        type: "string",
        description: "API name of the field to get picklist values for (e.g., Priority, Status, Type, Origin)"
      }
    },
    required: ["fieldName"]
  }
};

// Implementation for getting case metadata
export async function handleGetCaseMetadata(conn: any): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  try {
    // Get Case object metadata
    const caseDescribe = await conn.sobject("Case").describe();
    
    // Extract required fields
    const requiredFields = caseDescribe.fields.filter((field: any) => 
      !field.nillable && 
      !field.defaultedOnCreate && 
      field.createable && 
      field.name !== 'CaseNumber' // Skip CaseNumber as it's system-generated
    );
    
    // Extract picklist fields for common fields
    const picklistFields = caseDescribe.fields.filter((field: any) => 
      field.type === 'picklist' && 
      ['Priority', 'Status', 'Type', 'Origin'].includes(field.name)
    );
    
    // Format the response with clear instructions for the next steps
    const content = [
      {
        type: "text",
        text: `Case Object Metadata:\n\nRequired Fields:\n${requiredFields.map((field: any) => 
          `- ${field.label} (${field.name}): ${field.type}`
        ).join('\n')}\n\n` +
        `GUIDED CASE CREATION PROCESS - FOLLOW THESE STEPS IN ORDER:\n\n` +
        `1. FIRST STEP: Use the 'salesforce_search_accounts' tool to help the user find and select an account\n` +
        `   - Ask the user for an account name to search for\n` +
        `   - Once they provide a name, call salesforce_search_accounts with their search term\n` +
        `   - Present the results and ask them to select an account by number\n\n` +
        
        `2. SECOND STEP: After the user selects an account, use the 'salesforce_search_contacts' tool\n` +
        `   - Call salesforce_search_contacts with the selected accountId\n` +
        `   - Present the contact results and ask the user to select a contact by number\n\n` +
        
        `3. THIRD STEP: Ask for the Subject field (one field at a time)\n` +
        `   - Ask the user to provide a subject for the case\n` +
        `   - Wait for their response before proceeding\n\n` +
        
        `4. FOURTH STEP: Ask for the Description field (one field at a time)\n` +
        `   - Ask the user to provide a detailed description of the issue\n` +
        `   - Wait for their response before proceeding\n\n` +
        
        `5. FIFTH STEP: For each picklist field (Priority, Status, Type, Origin), use the salesforce_get_picklist_values tool\n` +
        `   - Call salesforce_get_picklist_values with fieldName="Priority"\n` +
        `   - Present the options and ask the user to select one\n` +
        `   - Wait for their response before proceeding to the next field\n` +
        `   - Repeat for Status, Type, and Origin fields\n\n` +
        
        `6. FINAL STEP: After collecting all required information, use the 'salesforce_create_case' tool\n` +
        `   - Call salesforce_create_case with all the collected information\n` +
        `   - Confirm to the user that the case has been created\n\n` +
        
        `IMPORTANT: Ask for ONE FIELD AT A TIME and wait for the user's response before proceeding to the next field.`
      }
    ];
    
    return { content, isError: false };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error getting case metadata: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}

// Implementation for searching accounts
export async function handleSearchAccounts(conn: any, args: { searchTerm: string }): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  try {
    const { searchTerm } = args;
    
    // Search for accounts matching the search term
    const accounts = await conn.sobject("Account").find({ Name: { $like: `%${searchTerm}%` } }, ["Id", "Name"]);
    
    if (accounts.length === 0) {
      return {
        content: [{ type: "text", text: "No accounts found matching your search criteria." }],
        isError: false
      };
    }
    
    // Format the response
    const content = [
      {
        type: "text",
        text: `Found ${accounts.length} accounts matching "${searchTerm}":\n\n${accounts.map((account: any, idx: number) => 
          `${idx + 1}. ${account.Name} (ID: ${account.Id})`
        ).join('\n')}`
      }
    ];
    
    return { content, isError: false };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error searching accounts: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}

// Implementation for searching contacts
export async function handleSearchContacts(conn: any, args: { accountId: string }): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  try {
    const { accountId } = args;
    
    // Get account name for reference
    const account = await conn.sobject("Account").retrieve(accountId);
    
    // Search for contacts related to the account
    const contacts = await conn.sobject("Contact").find({ AccountId: accountId }, ["Id", "Name", "Email", "Phone"]);
    
    if (contacts.length === 0) {
      return {
        content: [{ type: "text", text: `No contacts found for account "${account.Name}" (ID: ${accountId}).` }],
        isError: false
      };
    }
    
    // Format the response
    const content = [
      {
        type: "text",
        text: `Found ${contacts.length} contacts for account "${account.Name}":\n\n${contacts.map((contact: any, idx: number) => 
          `${idx + 1}. ${contact.Name} (ID: ${contact.Id})\n   Email: ${contact.Email || 'N/A'}\n   Phone: ${contact.Phone || 'N/A'}`
        ).join('\n\n')}`
      }
    ];
    
    return { content, isError: false };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error searching contacts: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}

// Implementation for creating a case
export async function handleCreateCase(conn: any, args: any): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  try {
    const { subject, description, priority, status, accountId, contactId, caseType, origin, additionalFields } = args;
    
    // Prepare the case record
    const caseRecord: Record<string, any> = {
      Subject: subject,
      Description: description,
      Priority: priority,
      Status: status,
      AccountId: accountId
    };
    
    // Add contact if provided
    if (contactId) {
      caseRecord.ContactId = contactId;
    }
    
    // Add case type and origin if provided
    if (caseType) {
      caseRecord.Type = caseType;
    }
    if (origin) {
      caseRecord.Origin = origin;
    }
    
    // Add any additional fields
    if (additionalFields) {
      Object.assign(caseRecord, additionalFields);
    }
    
    // Create the case
    const result = await conn.sobject("Case").create(caseRecord);
    
    if (result.success) {
      // Get the instance URL from the connection
      const instanceUrl = conn.instanceUrl || process.env.SALESFORCE_INSTANCE_URL;
      const caseUrl = `${instanceUrl}/lightning/r/Case/${result.id}/view`;
      
      return {
        content: [
          { 
            type: "text", 
            text: `The case has been created successfully!\n\nCase Details:\n\n- Case ID: ${result.id}\n- Subject: ${subject}\n- Priority: ${priority}\n- Status: ${status}\n\nYou can view the case at: ${caseUrl}`
          }
        ],
        isError: false
      };
    } else {
      return {
        content: [{ type: "text", text: `Failed to create case: ${result.errors?.join(', ')}` }],
        isError: true
      };
    }
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error creating case: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}

// Implementation for getting picklist values
export async function handleGetPicklistValues(conn: any, args: { fieldName: string }): Promise<{ content: { type: string, text: string }[], isError: boolean }> {
  try {
    const { fieldName } = args;
    
    // Get Case object metadata
    const caseDescribe = await conn.sobject("Case").describe();
    
    // Find the specified field
    const field = caseDescribe.fields.find((f: any) => f.name === fieldName);
    
    if (!field) {
      return {
        content: [{ type: "text", text: `Field '${fieldName}' not found on Case object.` }],
        isError: true
      };
    }
    
    if (field.type !== 'picklist') {
      return {
        content: [{ type: "text", text: `Field '${fieldName}' is not a picklist field.` }],
        isError: true
      };
    }
    
    // Format the response
    const content = [
      {
        type: "text",
        text: `Picklist values for ${field.label} (${fieldName}):\n\n${field.picklistValues.map((value: any, idx: number) => 
          `${idx + 1}. ${value.label}${value.defaultValue ? ' (Default)' : ''}`
        ).join('\n')}\n\nPlease ask the user to select one of these values for the ${field.label} field.`
      }
    ];
    
    return { content, isError: false };
  } catch (error) {
    return {
      content: [{ 
        type: "text", 
        text: `Error getting picklist values: ${error instanceof Error ? error.message : String(error)}` 
      }],
      isError: true
    };
  }
}
