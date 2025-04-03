import dotenv from 'dotenv';
import { createSalesforceConnection } from './dist/utils/connection.js';
import { handleDMLRecords } from './dist/tools/dml.js';
import { handleQueryRecords } from './dist/tools/query.js';

// Load environment variables
dotenv.config();

async function getDefaultBusinessHours(conn) {
  try {
    const businessHoursResult = await handleQueryRecords(conn, {
      objectName: 'BusinessHours',
      fields: ['Id'],
      whereClause: 'IsDefault=true',
      limit: 1
    });

    if (businessHoursResult.content && businessHoursResult.content[0]) {
      const text = businessHoursResult.content[0].text;
      const match = text.match(/Id: ([a-zA-Z0-9]+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
    throw new Error('No default business hours found');
  } catch (error) {
    console.error('Error querying business hours:', error);
    throw error;
  }
}

async function createTestCase(conn) {
  try {
    console.log('Creating test case with guided input...');
    
    // Using empty record array since we're using guided input
    const result = await handleDMLRecords(conn, {
      operation: 'insert',
      objectName: 'Case',
      records: [{}],
      guidedInput: true
    });

    if (result.content && result.content[0]) {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      
      if (!result.isError) {
        const text = result.content[0].text;
        const idMatch = text.match(/Record \d+ - ID: (\w+)/);
        if (idMatch && idMatch[1]) {
          const caseId = idMatch[1];
          console.log('\nCase created successfully!');
          const caseUrl = `${conn.instanceUrl}/lightning/r/Case/${caseId}/view`;
          console.log(`Case URL: ${caseUrl}`);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error creating test case:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Establishing Salesforce connection...');
    const conn = await createSalesforceConnection();
    console.log('Connection established successfully!');
    
    // Test: Create case with guided input
    console.log('\nTesting Case creation with guided input...');
    await createTestCase(conn);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
