import urllib.request
import urllib.parse
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fetch_wikidata_battles():
    # We select battles (Q178561) and sieges (Q188055) and wars (Q198).
    # We extract label, description, coordinates, date, and English Wikipedia link.
    query = """
    SELECT DISTINCT ?conflict ?conflictLabel ?conflictDescription ?date ?coord ?article WHERE {
      { ?conflict wdt:P31/wdt:P279* wd:Q178561. } # Battles
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q188055. } # Sieges
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q198. }    # Wars
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q12184. }  # Pandemics
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q131569. } # Treaties
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q8065. }   # Natural Disasters
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q132821. } # Murder/Assassination
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q10787131. } # Terrorist Attack
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q2409581. }  # Military Operation
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q598609. }   # Military Campaign
      UNION
      { ?conflict wdt:P31/wdt:P279* wd:Q842013. }   # Civil Unrest/Riots
      
      ?conflict wdt:P625 ?coord.
      
      { ?conflict wdt:P585 ?date. }     # Point in time (single day events)
      UNION
      { ?conflict wdt:P580 ?date. }     # Start time (multi-year events)
                
      ?article schema:about ?conflict;
               schema:inLanguage "en";
               schema:isPartOf <https://en.wikipedia.org/>.
               
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    """
    
    url = "https://query.wikidata.org/sparql?query=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={
        'Accept': 'application/sparql-results+json', 
        'User-Agent': 'GlobalConflictTracker/1.0 (Mozilla/5.0)'
    })
    
    logger.info("Executing vast historical query against Wikidata...")
    
    hotspots = []
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            results = data.get('results', {}).get('bindings', [])
            
            logger.info(f"Retrieved {len(results)} raw historical conflict records.")
            
            for item in results:
                try:
                    # Parse Coordinates "Point(-77.0563 38.8719)"
                    point_str = item.get('coord', {}).get('value', '')
                    if not point_str.startswith('Point('):
                        continue
                    coords = point_str.replace('Point(', '').replace(')', '').split()
                    lng, lat = float(coords[0]), float(coords[1])
                    
                    # Parse Date "1941-12-07T00:00:00Z"
                    date_str = item.get('date', {}).get('value', '')
                    
                    # Handle BCE dates which start with '-'
                    # e.g., "-0480-08-11T00:00:00Z" for Battle of Thermopylae
                    is_bce = False
                    if date_str.startswith('-'):
                        is_bce = True
                        date_str = date_str[1:] # Strip leading minus for parsing
                        
                    dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
                    year = -dt.year if is_bce else dt.year
                    
                    label = item.get('conflictLabel', {}).get('value', 'Unknown Conflict')
                    desc = item.get('conflictDescription', {}).get('value', 'Historical conflict.')
                    wiki = item.get('article', {}).get('value', '')
                    
                    # Avoid duplicates or junk
                    if not wiki:
                        continue
                        
                    hotspots.append({
                        "lat": lat,
                        "lng": lng,
                        "trigger": "Historical Event",
                        "label": label,
                        "description": desc,
                        "severity": "CRITICAL",
                        "timestamp": f"{year}-01-01T00:00:00Z", # Normalised timestamp for frontend
                        "source": "Wikidata Historical Archives",
                        "wiki_url": wiki,
                        "year": year
                    })
                except Exception as row_e:
                    continue
                    
    except Exception as e:
        logger.error(f"Failed to fetch data: {e}")
        return []
        
    # Remove duplicates based on label and year
    seen = set()
    unique_hotspots = []
    for h in hotspots:
        key = f"{h['label']}_{h['year']}"
        if key not in seen:
            seen.add(key)
            unique_hotspots.append(h)
            
    # Sort chronologically
    unique_hotspots.sort(key=lambda x: x['year'])
    
    logger.info(f"Successfully processed {len(unique_hotspots)} unique historical conflicts.")
    return unique_hotspots

if __name__ == "__main__":
    db = fetch_wikidata_battles()
    with open('historical_db.json', 'w') as f:
        json.dump(db, f, indent=4)
    logger.info("Saved historical_db.json successfully!")
