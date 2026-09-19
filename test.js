const { Client } = require('pg');

// Your Neon database connection string
const DATABASE_URL = 'postgresql://neondb_owner:npg_sWki6h7OIYbE@ep-hidden-darkness-ap95myx4-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=verify-full';

const client = new Client({
  connectionString: DATABASE_URL,
  // Explicitly enabling SSL is highly recommended for Neon connections
  ssl: true 
});

async function getAuthEvents() {
  try {
    // 1. Connect to the database
    await client.connect();
    console.log("✅ Successfully connected to Neon database.\n");

    // 2. Define your query
    const queryText = `
      SELECT action, email, ip, user_agent, success, created_at
      FROM auth_events
      ORDER BY created_at DESC
      LIMIT 50;
    `;

    // 3. Execute the query
    const result = await client.query(queryText);

    // 4. Output the results
    if (result.rows.length === 0) {
      console.log("No auth events found.");
    } else {
      console.table(result.rows);
    }

  } catch (error) {
    console.error("❌ Error executing query:", error.message);
  } finally {
    // 5. Close the connection to prevent the script from hanging
    await client.end();
    console.log("\n🔌 Database connection closed.");
  }
}

// Run the function
getAuthEvents();