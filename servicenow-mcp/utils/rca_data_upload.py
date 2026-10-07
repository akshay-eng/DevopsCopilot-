import json
import numpy as np
import os
from pymilvus import connections, FieldSchema, CollectionSchema, DataType, Collection, utility
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import uuid

# Configuration
MILVUS_HOST = "172.17.204.5"
MILVUS_PORT = "19530"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
COLLECTION_NAME = "rca"
EMBEDDING_DIM = 384  # Dimension for all-MiniLM-L6-v2 model
JSON_FILE_PATH = r"E:\\stack-overflow-scraping\\snow\\rca_data.json"

class MilvusRCAUploader:
    def __init__(self):
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
        self.connect_to_milvus()
    
    def connect_to_milvus(self):
        """Connect to Milvus database."""
        try:
            connections.connect(alias="default", host=MILVUS_HOST, port=MILVUS_PORT)
            print(f"✅ Connected to Milvus at {MILVUS_HOST}:{MILVUS_PORT}")
        except Exception as e:
            print(f"❌ Failed to connect to Milvus: {e}")
            raise
    
    def create_rca_collection(self):
        """Create the RCA collection with proper schema."""
        # Drop existing collection if it exists
        if utility.has_collection(COLLECTION_NAME):
            collection = Collection(COLLECTION_NAME)
            collection.drop()
            print(f"🗑️ Dropped existing collection: {COLLECTION_NAME}")
        
        # Define schema
        fields = [
            FieldSchema(name="id", dtype=DataType.VARCHAR, is_primary=True, max_length=100),
            FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=500),
            FieldSchema(name="description", dtype=DataType.VARCHAR, max_length=2000),
            FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=100),
            FieldSchema(name="severity", dtype=DataType.VARCHAR, max_length=50),
            FieldSchema(name="symptoms", dtype=DataType.VARCHAR, max_length=2000),
            FieldSchema(name="root_cause_analysis", dtype=DataType.VARCHAR, max_length=3000),
            FieldSchema(name="resolution_steps", dtype=DataType.VARCHAR, max_length=5000),
            FieldSchema(name="prevention", dtype=DataType.VARCHAR, max_length=2000),
            FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM)
        ]
        
        schema = CollectionSchema(fields, f"RCA Knowledge Base Collection")
        collection = Collection(COLLECTION_NAME, schema)
        
        print(f"✅ Created collection: {COLLECTION_NAME}")
        return collection
    
    def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for the given texts."""
        try:
            embeddings = self.embedding_model.encode(texts)
            return embeddings.tolist()
        except Exception as e:
            print(f"❌ Error generating embeddings: {e}")
            raise
    
    def load_data_from_json(self, json_file_path: str) -> List[Dict[str, Any]]:
        """Load RCA data from a JSON file with flexible structure support."""
        try:
            # Check if file exists and is not empty
            if not os.path.exists(json_file_path):
                raise FileNotFoundError(f"JSON file not found: {json_file_path}")
            
            if os.path.getsize(json_file_path) == 0:
                raise ValueError(f"JSON file is empty: {json_file_path}")
            
            with open(json_file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    raise ValueError(f"JSON file contains no content: {json_file_path}")
                
                data = json.loads(content)
            
            print(f"📁 Loading data from: {json_file_path}")
            processed_data = []
            
            # Support multiple JSON structures
            problems_list = []
            
            # Check different possible structures
            if "kubernetes_problems" in data:
                problems_list = data["kubernetes_problems"]
                print(f"Found {len(problems_list)} kubernetes problems")
            elif "problems" in data:
                problems_list = data["problems"]
                print(f"Found {len(problems_list)} problems")
            elif "rca_data" in data:
                problems_list = data["rca_data"]
                print(f"Found {len(problems_list)} RCA records")
            elif isinstance(data, list):
                problems_list = data
                print(f"Found {len(problems_list)} records in array format")
            else:
                print("⚠️ Unknown JSON structure, treating as single record")
                problems_list = [data]
            
            for i, problem in enumerate(problems_list):
                try:
                    # Handle symptoms (can be array or string)
                    symptoms = problem.get("symptoms", [])
                    if isinstance(symptoms, list):
                        symptoms_str = " | ".join(symptoms)
                    else:
                        symptoms_str = str(symptoms)
                    
                    # Handle root cause analysis (can be object or string)
                    rca = problem.get("root_cause_analysis", {})
                    if isinstance(rca, dict):
                        rca_str = f"Primary Cause: {rca.get('primary_cause', 'Unknown')}. "
                        
                        # Handle investigation steps
                        investigation_steps = rca.get('investigation_steps', [])
                        if isinstance(investigation_steps, list):
                            rca_str += f"Investigation Steps: {' | '.join(investigation_steps)}. "
                        
                        # Handle common causes
                        common_causes = rca.get('common_causes', [])
                        if isinstance(common_causes, list):
                            rca_str += f"Common Causes: {' | '.join(common_causes)}"
                    else:
                        rca_str = str(rca)
                    
                    # Handle resolution steps (can be array of objects or string)
                    resolution_steps = problem.get("resolution_steps", [])
                    resolution_str = ""
                    
                    if isinstance(resolution_steps, list) and len(resolution_steps) > 0:
                        if isinstance(resolution_steps[0], dict):
                            # Structured resolution steps
                            for step in resolution_steps:
                                step_num = step.get('step', '')
                                action = step.get('action', '')
                                command = step.get('command', '')
                                expected = step.get('expected_output', '')
                                resolution_str += f"Step {step_num}: {action} - Command: {command} - Expected: {expected} | "
                        else:
                            # Simple string array
                            resolution_str = " | ".join([str(step) for step in resolution_steps])
                    else:
                        resolution_str = str(resolution_steps)
                    
                    # Handle prevention (can be array or string)
                    prevention = problem.get("prevention", [])
                    if isinstance(prevention, list):
                        prevention_str = " | ".join(prevention)
                    else:
                        prevention_str = str(prevention)
                    
                    # Generate ID if not provided
                    record_id = problem.get("id")
                    if not record_id:
                        record_id = f"RCA-{i+1:03d}"
                    
                    processed_data.append({
                        "id": record_id,
                        "title": problem.get("title", "Unknown Issue"),
                        "description": problem.get("description", ""),
                        "category": problem.get("category", "General"),
                        "severity": problem.get("severity", "Medium"),
                        "symptoms": symptoms_str,
                        "root_cause_analysis": rca_str,
                        "resolution_steps": resolution_str.rstrip(" | "),
                        "prevention": prevention_str
                    })
                    
                    print(f"✅ Processed record {i+1}: {problem.get('title', 'Unknown')}")
                    
                except Exception as e:
                    print(f"⚠️ Error processing record {i+1}: {e}")
                    continue
            
            print(f"📊 Successfully processed {len(processed_data)} records")
            return processed_data
            
        except FileNotFoundError:
            print(f"❌ JSON file not found: {json_file_path}")
            raise
        except ValueError as e:
            print(f"❌ {e}")
            raise
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON format: {e}")
            print(f"💡 Please check your JSON file syntax at line {e.lineno if hasattr(e, 'lineno') else 'unknown'}")
            raise
        except Exception as e:
            print(f"❌ Error loading JSON file: {e}")
            raise
    
    def upload_data_to_milvus(self, data: List[Dict[str, Any]]):
        """Upload processed data to Milvus collection."""
        collection = Collection(COLLECTION_NAME)
        
        # Prepare data for insertion
        ids = []
        titles = []
        descriptions = []
        categories = []
        severities = []
        symptoms_list = []
        root_cause_analyses = []
        resolution_steps_list = []
        preventions = []
        embedding_texts = []
        
        for item in data:
            ids.append(item["id"])
            titles.append(item["title"])
            descriptions.append(item["description"])
            categories.append(item["category"])
            severities.append(item["severity"])
            symptoms_list.append(item["symptoms"])
            root_cause_analyses.append(item["root_cause_analysis"])
            resolution_steps_list.append(item["resolution_steps"])
            preventions.append(item["prevention"])
            
            # Create comprehensive text for embedding
            embedding_text = f"{item['title']} {item['description']} {item['symptoms']} {item['category']}"
            embedding_texts.append(embedding_text)
        
        # Generate embeddings
        print("🔄 Generating embeddings...")
        embeddings = self.create_embeddings(embedding_texts)
        
        # Prepare data for insertion
        data_to_insert = [
            ids,
            titles,
            descriptions,
            categories,
            severities,
            symptoms_list,
            root_cause_analyses,
            resolution_steps_list,
            preventions,
            embeddings
        ]
        
        # Insert data
        print(f"📤 Uploading {len(data)} records to Milvus...")
        mr = collection.insert(data_to_insert)
        print(f"✅ Inserted {len(mr.primary_keys)} records")
        
        # Create index
        print("🔄 Creating index...")
        index_params = {
            "metric_type": "COSINE",
            "index_type": "IVF_FLAT",
            "params": {"nlist": 128}
        }
        collection.create_index("embedding", index_params)
        print("✅ Index created")
        
        # Load collection
        collection.load()
        print("✅ Collection loaded and ready for search")
        
        return mr
    
    def test_search(self, query: str = "pod pending"):
        """Test search functionality."""
        collection = Collection(COLLECTION_NAME)
        collection.load()
        
        # Generate embedding for query
        query_embedding = self.embedding_model.encode([query]).tolist()
        
        # Search
        results = collection.search(
            query_embedding,
            "embedding",
            {"metric_type": "COSINE", "params": {"nprobe": 10}},
            limit=2,
            output_fields=["title", "category", "severity", "description"]
        )
        
        print(f"\n🔍 Search results for: '{query}'")
        for hit in results[0]:
            print(f"- {hit.entity.get('title')} (Score: {hit.score:.3f})")
            print(f"  Category: {hit.entity.get('category')}, Severity: {hit.entity.get('severity')}")
            print(f"  Description: {hit.entity.get('description')[:100]}...")
            print()

def main():
    """Main function to upload RCA data from JSON file."""
    print("🚀 Starting RCA Data Upload to Milvus")
    print("="*60)
    
    uploader = MilvusRCAUploader()
    
    # Create collection
    collection = uploader.create_rca_collection()
    
    try:
        # Load data from JSON file
        print(f"📁 Loading RCA data from: {JSON_FILE_PATH}")
        rca_data = uploader.load_data_from_json(JSON_FILE_PATH)
        
        if not rca_data:
            print("❌ No data loaded from JSON file")
            return
        
        # Upload data
        uploader.upload_data_to_milvus(rca_data)
        
        # Test search with some sample queries
        test_queries = [
            "pod stuck pending state",
            "image pull error", 
            "container crash loop",
            "database connection",
            "network timeout"
        ]
        
        for query in test_queries:
            uploader.test_search(query)
        
        print(f"\n🎉 RCA data upload completed successfully!")
        print(f"📈 Collection '{COLLECTION_NAME}' is ready with {len(rca_data)} records")
        print(f"🔗 Data loaded from: {JSON_FILE_PATH}")
        
    except FileNotFoundError:
        print(f"❌ JSON file '{JSON_FILE_PATH}' not found!")
        print("\n📝 Please ensure your JSON file exists at the specified path.")
        print("Expected JSON structure example:")
        print('''
{
  "kubernetes_problems": [
    {
      "id": "K8S-001",
      "title": "Pod Stuck in Pending State",
      "severity": "High",
      "category": "Scheduling",
      "description": "Multiple pods remain in Pending state...",
      "symptoms": ["kubectl get pods shows status as Pending", "..."],
      "root_cause_analysis": {
        "primary_cause": "Insufficient cluster resources",
        "investigation_steps": ["Check node resource availability", "..."],
        "common_causes": ["Insufficient CPU or memory", "..."]
      },
      "resolution_steps": [
        {
          "step": 1,
          "action": "Describe the pending pod",
          "command": "kubectl describe pod <pod-name>",
          "expected_output": "Shows events and scheduling failures"
        }
      ],
      "prevention": ["Implement cluster autoscaling", "..."]
    }
  ]
}
        ''')
        
    except Exception as e:
        print(f"❌ Error during upload: {e}")

if __name__ == "__main__":
    main()