import json
from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType
from sentence_transformers import SentenceTransformer
from pymilvus import utility

# Milvus Config
MILVUS_HOST = "172.17.204.5"
MILVUS_PORT = "19530"
COLLECTION_NAME = "incident_history"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Connect to Milvus
connections.connect(host=MILVUS_HOST, port=MILVUS_PORT)

# Load model
model = SentenceTransformer(EMBEDDING_MODEL)

# Define schema
fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
    FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=200),
    FieldSchema(name="description", dtype=DataType.VARCHAR, max_length=1000),
    FieldSchema(name="urgency", dtype=DataType.INT64),
    FieldSchema(name="impact", dtype=DataType.INT64),
    FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=384)
]
schema = CollectionSchema(fields, description="K8s incidents with embeddings")

# Drop if exists and create new
if utility.has_collection("incident_history"):
    Collection("incident_history").drop()

collection = Collection(name=COLLECTION_NAME, schema=schema)

index_params = {
    "index_type": "IVF_FLAT",
    "metric_type": "COSINE",
    "params": {"nlist": 128}
}
collection.create_index(
    field_name="embedding",
    index_params=index_params
)

# Load the collection
collection.load()


# Load data
with open("E:\\stack-overflow-scraping\\snow\\snow_history.json") as f:
    data = json.load(f)

titles, descriptions, urgencies, impacts, embeddings = [], [], [], [], []

for item in data:
    text = f"{item['title']}. {item['description']}"
    emb = model.encode(text).tolist()
    titles.append(item["title"])
    descriptions.append(item["description"])
    urgencies.append(item.get("urgency", 1))
    impacts.append(item.get("impact", 1))
    embeddings.append(emb)

# Insert
entities = [titles, descriptions, urgencies, impacts, embeddings]
collection.insert(entities)

print(f"✅ Inserted {len(titles)} Kubernetes incidents into Milvus collection '{COLLECTION_NAME}'")
