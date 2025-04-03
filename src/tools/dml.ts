import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { DMLResult, SalesforceField } from "../types/salesforce.js";

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
        // For Case objects, direct users to use the dedicated case creation tools instead
        return {
          content: [{
            type: "text",
            text: "For creating Case records, please use the dedicated case creation tools:\n" +
                  "1. salesforce_get_case_metadata - Get required fields and picklist values\n" +
                  "2. salesforce_search_accounts - Search for accounts\n" +
                  "3. salesforce_search_contacts - Search for contacts\n" +
                  "4. salesforce_get_picklist_values - Get picklist values for a specific field\n" +
                  "5. salesforce_create_case - Create the case with collected information\n\n" +
                  "These tools provide a better guided experience for creating cases."
          }],
          isError: true
        };
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
