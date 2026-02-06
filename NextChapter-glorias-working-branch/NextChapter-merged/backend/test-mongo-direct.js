const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://thenextchapter_db_user:Admin123@cluster0.aegxxlj.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Successfully connected to MongoDB!");
  } catch(error) {
    console.error("❌ Connection Error:", error.message);
  } finally {
    await client.close();
  }
}

run();
