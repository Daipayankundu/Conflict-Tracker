from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import logging

import sys
import os
# Ensure Vercel can find the adjacent files in the api folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our custom modules
from scrapers import fetch_all_osint
from anomaly_engine import calculate_threat_index

# Configure basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the FastAPI app
app = FastAPI(title="Global Conflict Tracker API", version="1.0.0")

import os

# Configure CORS (Cross-Origin Resource Sharing)
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# In production, we strictly lock the API down to your Vercel URL
# to prevent other websites from stealing your data or DDoSing your server.
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))
else:
    # Fallback for preview branches, but prints a security warning
    logger.warning("FRONTEND_URL is not set. Defaulting to wildcard CORS. NOT RECOMMENDED FOR PROD.")
    origins.append("*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET"],  # Strictly only allow GET requests (Read-Only)
    allow_headers=["*"], 
)

# Define the expected JSON response model using Pydantic
class Hotspot(BaseModel):
    lat: float
    lng: float
    trigger: str
    label: str
    description: str
    severity: str
    timestamp: str
    source: str
    wiki_url: str
    year: int

class ThreatIndexResponse(BaseModel):
    global_anomaly_score: float
    active_hotspots: List[Hotspot]

import json

# Load the production-grade WW2 and Ancient History Database
HISTORICAL_DB = []
db_path = os.path.join(os.path.dirname(__file__), "historical_db.json")
if os.path.exists(db_path):
    with open(db_path, "r", encoding="utf-8") as f:
        HISTORICAL_DB = json.load(f)
else:
    logger.warning("historical_db.json not found! Run the Wikidata scraper script.")

@app.get("/api/v1/historical-conflicts", response_model=List[Hotspot])
async def get_historical_conflicts():
    return HISTORICAL_DB

@app.get("/api/v1/global-threat-index", response_model=ThreatIndexResponse)
async def get_global_threat_index():
    """
    GET endpoint that triggers live OSINT scraping, evaluates the data against the ML baseline,
    and returns a normalized threat score with localized hotspots.
    """
    try:
        # Step 1: Fetch live OSINT data across all metrics concurrently
        logger.info("Triggering live OSINT data ingestion...")
        
        # Step 2: Pass the scraped data dictionary to the Machine Learning engine
        logger.info("Calculating threat index and mapping hotspots...")
        threat_score, hotspots = calculate_threat_index()
        
        # Step 3: Return the strictly formatted JSON response
        return {
            "global_anomaly_score": threat_score,
            "active_hotspots": hotspots
        }
        
    except Exception as e:
        logger.error(f"Error processing global threat index: {repr(e)}")
        # SECURITY FIX: Do not return str(e) to the client. This prevents 
        # Information Leakage (exposing internal file paths or logic to an attacker).
        raise HTTPException(
            status_code=500, 
            detail="An internal server error occurred while processing the intelligence feed."
        )
