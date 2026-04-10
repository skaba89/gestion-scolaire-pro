# To run this:
# 1. Install Flask: pip install Flask SQLAlchemy openai
# 2. Set environment variables: export FLASK_APP=backend/app.py && export OPENAI_API_KEY=your_key_here
# 3. Run the app: flask run

from flask import Flask, jsonify, request
from backend.generator import L1Generator
from backend.database import setup_database_session
from backend.repository import L1Repository
from backend.models import L1Version, L1Cluster, L1Shade
import os
import uuid

app = Flask(__name__)

# Setup database
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./schoolflow.db")
db_session = setup_database_session(DATABASE_URL)

# Setup L1 Generator
openai_api_key = os.environ.get("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("OPENAI_API_KEY environment variable not set.")
l1_generator = L1Generator(openai_api_key=openai_api_key)

@app.route('/api/l1/generate/<user_id>', methods=['POST'])
def generate_l1_endpoint(user_id: str):
    """
    Generates L1 data for a user and stores it.
    """
    # In a real application, you would fetch real L0 data for the user.
    # Here, we use placeholder data.
    l0_data = {
        "notes": ["Attended lecture on AI.", "Read chapter 5."],
        "todos": ["Finish homework on machine learning.", "Prepare for quiz."],
        "chats": ["Discussed project with team.", "Asked professor a question."]
    }

    # Run the generator
    result = l1_generator.run(user_id, l0_data)

    # Save to database
    l1_repo = L1Repository(db_session)
    
    new_version = L1Version(id=result.version_id, user_id=user_id, l1_clusters=[])
    
    for cluster_data in result.clusters:
        new_cluster = L1Cluster(
            id=cluster_data['id'],
            name=cluster_data['name'],
            summary=cluster_data['summary'],
            l1_shades=[]
        )
        for shade_data in cluster_data['shades']:
            new_shade = L1Shade(
                id=shade_data['id'],
                shade_name=shade_data['shade_name'],
                shade_details=shade_data['shade_details']
            )
            new_cluster.l1_shades.append(new_shade)
        new_version.l1_clusters.append(new_cluster)

    l1_repo.save_l1_data(new_version)

    return jsonify({
        "message": "L1 data generated successfully.",
        "version_id": result.version_id
    })

@app.route('/api/l1/versions/<user_id>', methods=['GET'])
def list_l1_versions_endpoint(user_id: str):
    """
    Lists all L1 data versions for a given user.
    """
    l1_repo = L1Repository(db_session)
    versions = l1_repo.get_versions_by_user(user_id)
    
    result = [
        {
            "id": version.id,
            "created_at": version.created_at.isoformat(),
            "clusters": [
                {
                    "name": cluster.name,
                    "summary": cluster.summary
                } for cluster in version.l1_clusters
            ]
        } for version in versions
    ]
    
    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
