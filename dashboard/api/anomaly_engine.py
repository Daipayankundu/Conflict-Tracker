import yfinance as yf
import numpy as np
import urllib.request
import json
import zipfile
import io
import time
import datetime

# --- CACHE SETUP ---
_GDELT_CACHE = {"timestamp": 0, "data": []}
_EONET_CACHE = {"timestamp": 0, "data": []}
CACHE_TTL = 300 # 5 minutes cache

def fetch_usgs_earthquakes():
    """Fetch live >4.5 Magnitude earthquakes globally from USGS."""
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
    hotspots = []
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'GlobalConflictTracker/1.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            for feature in data.get("features", []):
                props = feature.get("properties", {})
                geom = feature.get("geometry", {})
                coords = geom.get("coordinates", [0, 0])
                mag = props.get("mag", 0)
                
                if mag >= 5.0:
                    dt = datetime.datetime.fromtimestamp(props.get("time", 0) / 1000.0)
                    hotspots.append({
                        "lat": coords[1],
                        "lng": coords[0],
                        "trigger": f"Magnitude {mag} Earthquake",
                        "label": "Seismic Event",
                        "description": props.get("title", ""),
                        "severity": "CRITICAL" if mag >= 6.5 else "HIGH",
                        "timestamp": dt.isoformat() + "Z",
                        "source": "USGS Live OSINT",
                        "wiki_url": props.get("url", ""),
                        "year": dt.year
                    })
    except Exception as e:
        print(f"USGS Error: {e}")
    return hotspots

import random
import newspaper
import nltk
import logging

# Ensure NLTK tokenizers are downloaded on the Render server
try:
    nltk.download('punkt', quiet=True)
    nltk.download('punkt_tab', quiet=True)
except Exception as e:
    logging.warning(f"NLTK download failed: {e}")

def is_article_kinetic(url):
    """
    Deep Contextual Web Scraper:
    Visits the URL, reads the article body, and scores it based on keywords.
    Returns True if it's a true military/kinetic event, False if it's business/legal noise.
    """
    try:
        # Download and parse article with a fast timeout
        article = newspaper.Article(url, memoize_articles=False)
        article.download(timeout=3)
        article.parse()
        text = article.text.lower()
        
        # Hard junk keywords (automatic rejection)
        junk_words = ['startup', 'funding', 'lawsuit', 'court', 'plaintiff', 'raised', 'million', 'market share', 'ceo', 'profit', 'litigation', 'physicswallah', 'robotaxi', 'animal', 'wildlife', 'sports', 'movie']
        for junk in junk_words:
            if junk in text:
                return False
                
        # Strict Military Allowlist: The article MUST contain at least one hard kinetic keyword
        kinetic_words = ['strike', 'casualties', 'missile', 'troops', 'artillery', 'riot', 'deployed', 'military', 'army', 'rebel', 'gunfire', 'bomb', 'terrorism', 'drone', 'warfare', 'airfield', 'infantry']
        
        has_kinetic = any(kw in text for kw in kinetic_words)
        
        if not has_kinetic:
            return False # Drop it if it doesn't mention actual military combat terms
            
        return True
    except Exception as e:
        # If the web scraper fails (e.g. 403 Forbidden or paywall), default to FALSE.
        # We must aggressively prioritize signal over noise. If we can't verify it, we drop it.
        return False


def fetch_gdelt_live():
    global _GDELT_CACHE
    if time.time() - _GDELT_CACHE["timestamp"] < CACHE_TTL:
        return _GDELT_CACHE["data"]
        
    hotspots = []
    try:
        # Get latest 15-minute zip URL
        with urllib.request.urlopen('http://data.gdeltproject.org/gdeltv2/lastupdate.txt', timeout=5) as r:
            zip_url = r.read().decode('utf-8').split('\n')[0].split(' ')[-1]
        
        req = urllib.request.Request(zip_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            with zipfile.ZipFile(io.BytesIO(r.read())) as z:
                filename = z.namelist()[0]
                with z.open(filename) as f:
                    content = f.read().decode('utf-8')
                    lines = content.strip().split('\n')
                    
                    seen_urls = set()
                    seen_coords = set()
                    
                    for line in lines:
                        cols = line.split('\t')
                        if len(cols) >= 61:
                            root_code = cols[28] # EventRootCode
                            
                            # Filter for Military/Kinetic/Major Unrest (CAMEO 14, 17, 18, 19, 20)
                            if root_code in ['14', '17', '18', '19', '20']:
                                lat = cols[56] # ActionGeo_Lat
                                lng = cols[57] # ActionGeo_Long
                                url = cols[60].strip() # SOURCEURL
                                
                                try:
                                    num_mentions = int(cols[31])
                                    goldstein = float(cols[30])
                                except:
                                    num_mentions = 0
                                    goldstein = 0.0
                                    
                                # Only plot highly verified events AND events with a severely NEGATIVE Goldstein Scale (< -4.0)
                                # This filters out minor disputes, lawsuits, and non-kinetic coercion (-2.0 to -3.9)
                                if num_mentions < 10 or goldstein > -4.0:
                                    continue
                                    
                                # Identify if this is a natural disaster caught by GDELT's mass evacuation codes
                                url_lower = url.lower()
                                is_disaster = any(word in url_lower for word in ['wildfire', 'fire', 'weather', 'hurricane', 'storm', 'flood', 'climate', 'earthquake'])
                                
                                # Blocklist to explicitly drop legal cases
                                if any(word in url_lower for word in ['court', 'lawsuit', 'judge', 'rights', 'sues', 'litigation']):
                                    continue
                                
                                # Aggressive Deduplication: Round to 1 decimal place (~11km radius)
                                # This ensures if CNN and BBC report the same event with slightly different GPS tags, 
                                # we still catch it and merge it as a duplicate.
                                try:
                                    rounded_lat = round(float(lat), 1)
                                    rounded_lng = round(float(lng), 1)
                                    spatial_key = f"{rounded_lat},{rounded_lng}"
                                except:
                                    spatial_key = f"{lat},{lng}"
                                    
                                if url in seen_urls or spatial_key in seen_coords:
                                    continue
                                    
                                # Deep Contextual Scoring
                                if not is_disaster:
                                    # If it's a military event, deeply score the article text
                                    if not is_article_kinetic(url):
                                        continue
                                        
                                if lat and lng:
                                    seen_urls.add(url)
                                    seen_coords.add(spatial_key)
                                    
                                    labels = {'14':'Civil Unrest', '17':'Cyber / Coercion', '18':'Assault', '19':'Kinetic Strike', '20':'Mass Violence'}
                                    
                                    if is_disaster:
                                        label = "Severe Natural Event"
                                        trigger = f"GDELT Natural Disaster (Mentions: {num_mentions})"
                                        severity = "HIGH"
                                        desc = "Major environmental anomaly detected in global media."
                                    else:
                                        label = labels.get(root_code, "Security Event")
                                        trigger = f"GDELT Event (Mentions: {num_mentions})"
                                        severity = "CRITICAL" if root_code in ['19', '20'] else "HIGH"
                                        desc = "Confirmed kinetic/security event verified by Deep Scraper."
                                        
                                    hotspots.append({
                                        "lat": float(lat) + np.random.uniform(-0.1, 0.1),
                                        "lng": float(lng) + np.random.uniform(-0.1, 0.1),
                                        "trigger": trigger,
                                        "label": label,
                                        "description": desc,
                                        "severity": severity,
                                        "timestamp": datetime.datetime.now().isoformat() + "Z",
                                        "source": "GDELT Network",
                                        "wiki_url": url,
                                        "year": datetime.datetime.now().year
                                    })
                                        
        _GDELT_CACHE = {"timestamp": time.time(), "data": hotspots}
    except Exception as e:
        print(f"GDELT Error: {e}")
    return hotspots

def fetch_nasa_eonet():
    global _EONET_CACHE
    if time.time() - _EONET_CACHE["timestamp"] < CACHE_TTL:
        return _EONET_CACHE["data"]
        
    hotspots = []
    try:
        url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode('utf-8'))
            events = data.get('events', [])
            
            for event in events:
                geom = event.get('geometry', [{}])[0]
                if geom.get('type') == 'Point':
                    coords = geom.get('coordinates', [0, 0])
                    sources = event.get('sources', [{}])
                    source_url = sources[0].get('url', '') if sources else ''
                    
                    hotspots.append({
                        "lat": coords[1],
                        "lng": coords[0],
                        "trigger": "EONET Detection",
                        "label": "Severe Natural Event",
                        "description": event.get('title', 'NASA Environmental Alert'),
                        "severity": "HIGH",
                        "timestamp": datetime.datetime.now().isoformat() + "Z",
                        "source": "NASA EONET",
                        "wiki_url": source_url,
                        "year": datetime.datetime.now().year
                    })
        _EONET_CACHE = {"timestamp": time.time(), "data": hotspots}
    except Exception as e:
        print(f"NASA Error: {e}")
    return hotspots

def calculate_threat_index():
    """
    Computes a global threat score using live defense stock data,
    and returns a combined list of live OSINT events (GDELT + NASA + Earthquakes).
    """
    tickers = ['LMT', 'RTX', 'NOC', 'GD']
    data = yf.download(tickers, period='5d', interval='1d', progress=False)
    
    if data.empty or 'Close' not in data:
        return 0.5, []
        
    closes = data['Close']
    returns = closes.pct_change().dropna()
    
    z_scores = []
    for ticker in tickers:
        series = returns[ticker]
        if series.std() == 0:
            continue
        z = (series.iloc[-1] - series.mean()) / series.std()
        z_scores.append(z)
        
    if not z_scores:
        return 0.5, []
        
    avg_z = np.mean(z_scores)
    
    # Sigmoid function to normalize between 0 and 1
    anomaly_score = 1 / (1 + np.exp(-avg_z))
    
    # Fetch live OSINT feeds (with caching built-in)
    live_hotspots = fetch_usgs_earthquakes() + fetch_gdelt_live() + fetch_nasa_eonet()
    
    # Dynamically generate a stock-based hotspot if score is very high
    if anomaly_score > 0.8:
        live_hotspots.append({
            "lat": 38.8719,
            "lng": -77.0563, # Pentagon
            "trigger": "Market Anomaly Detected",
            "label": "Defense Sector Surge",
            "description": f"Abnormal volatility detected in global defense equities (Z-Score: {avg_z:.2f}).",
            "severity": "CRITICAL",
            "timestamp": datetime.datetime.now().isoformat() + "Z",
            "source": "Financial OSINT",
            "wiki_url": "https://en.wikipedia.org/wiki/Military%E2%80%93industrial_complex",
            "year": datetime.datetime.now().year
        })
        
    return float(anomaly_score), live_hotspots
