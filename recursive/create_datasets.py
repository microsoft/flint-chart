#!/usr/bin/env python3
"""
Create 50 test datasets from TidyTuesday + Vega datasets.
Each dataset gets a DF-style transformation applied, then saved as JSON
with metadata about source and transformation.
"""
import pandas as pd
import json
import os
from pathlib import Path

OUT_DIR = Path("/home/chenwang/flint-chart/recursive/datasets")
TT_BASE = Path("/home/chenwang/data-formulator/experiment_data/tidytuesday")
VEGA_BASE = Path("/home/chenwang/data-formulator/.pyprefix/local/lib/python3.12/dist-packages/vega_datasets/_data")

def save_dataset(name, df, source, transformation, description, max_rows=200):
    """Save a dataset as JSON with metadata."""
    if len(df) > max_rows:
        df = df.head(max_rows)
    
    # Clean data: convert to native Python types, handle NaN
    records = json.loads(df.to_json(orient="records", date_format="iso"))
    
    meta = {
        "name": name,
        "description": description,
        "source": source,
        "transformation": transformation,
        "num_rows": len(records),
        "columns": {col: str(df[col].dtype) for col in df.columns},
    }
    
    out_path = OUT_DIR / f"{name}.json"
    with open(out_path, "w") as f:
        json.dump({"meta": meta, "data": records}, f, indent=2, default=str)
    
    print(f"  ✓ {name}: {len(records)} rows, {len(df.columns)} cols")
    return meta


datasets = []

# ── TidyTuesday datasets ──────────────────────────────────────────────

# 1. Big Tech Stock Prices — monthly avg close by company
df = pd.read_csv(TT_BASE / "2023/2023-02-07/big_tech_stock_prices.csv")
companies = pd.read_csv(TT_BASE / "2023/2023-02-07/big_tech_companies.csv")
df["date"] = pd.to_datetime(df["date"])
df["month"] = df["date"].dt.to_period("M").dt.to_timestamp()
agg = df.groupby(["stock_symbol", "month"]).agg(avg_close=("close", "mean"), avg_volume=("volume", "mean")).reset_index()
agg = agg.merge(companies, on="stock_symbol")
agg = agg[agg["month"] >= "2022-01-01"]
datasets.append(save_dataset("tech_stocks_monthly", agg, 
    "tidytuesday/2023-02-07/big_tech_stock_prices.csv",
    "Group by company+month, compute avg close price. Filter to 2022+.",
    "Monthly average closing prices for major tech companies"))

# 2. Age Gaps in Movies — distribution
df = pd.read_csv(TT_BASE / "2023/2023-02-14/age_gaps.csv")
df = df[["movie_name", "release_year", "age_difference", "character_1_gender", "character_2_gender"]].copy()
datasets.append(save_dataset("movie_age_gaps", df,
    "tidytuesday/2023-02-14/age_gaps.csv",
    "Select relevant columns (movie, year, age gap, genders).",
    "Age differences between movie love interests over time"))

# 3. Bob Ross paintings — element frequency
df = pd.read_csv(TT_BASE / "2023/2023-02-21/bob_ross.csv")
elements = [c for c in df.columns if c not in ["painting_index","img_src","painting_title","season","episode","YouTube_src","colors","color_hex","num_colors"]]
melted = df.melt(id_vars=["painting_title","season"], value_vars=elements, var_name="element", value_name="present")
melted = melted[melted["present"] == 1]
freq = melted.groupby("element").size().reset_index(name="count").sort_values("count", ascending=False).head(20)
datasets.append(save_dataset("bob_ross_elements", freq,
    "tidytuesday/2023-02-21/bob_ross.csv",
    "Melt element columns, count frequency of each element across paintings. Top 20.",
    "Frequency of painting elements in Bob Ross episodes"))

# 4. Soccer results — home vs away goals
df = pd.read_csv(TT_BASE / "2023/2023-04-04/soccer21-22.csv")
df = df[["Date","HomeTeam","AwayTeam","FTHG","FTAG","FTR"]].copy()
df.columns = ["date","home_team","away_team","home_goals","away_goals","result"]
datasets.append(save_dataset("soccer_results", df,
    "tidytuesday/2023-04-04/soccer21-22.csv",
    "Select and rename key columns (teams, goals, result).",
    "English Premier League 2021-22 match results"))

# 5. London Marathon — participation over time
df = pd.read_csv(TT_BASE / "2023/2023-04-25/london_marathon.csv")
df = df[["Year","Applicants","Accepted","Starters","Finishers"]].dropna()
for c in ["Applicants","Accepted","Starters","Finishers"]:
    df[c] = pd.to_numeric(df[c], errors="coerce")
df = df.dropna()
datasets.append(save_dataset("london_marathon", df,
    "tidytuesday/2023-04-25/london_marathon.csv",
    "Select participation columns, clean numeric values.",
    "London Marathon participation stats over the years"))

# 6. Egg production — monthly trends by type
df = pd.read_csv(TT_BASE / "2023/2023-04-11/egg-production.csv")
df["observed_month"] = pd.to_datetime(df["observed_month"])
df = df[df["prod_process"].isin(["all", "cage-free (organic)", "cage-free (non-organic)"])]
datasets.append(save_dataset("egg_production", df,
    "tidytuesday/2023-04-11/egg-production.csv",
    "Filter to main production processes, parse dates.",
    "US egg production by type over time"))

# 7. Taylor Swift albums — scores
df = pd.read_csv(TT_BASE / "2023/2023-10-17/taylor_albums.csv")
df = df.dropna(subset=["metacritic_score"])
datasets.append(save_dataset("taylor_albums", df,
    "tidytuesday/2023-10-17/taylor_albums.csv",
    "Drop rows without metacritic scores.",
    "Taylor Swift album ratings"))

# 8. Taylor Swift songs — audio features
df = pd.read_csv(TT_BASE / "2023/2023-10-17/taylor_album_songs.csv")
df = df[["album_name","track_name","danceability","energy","valence","tempo","duration_ms"]].dropna()
datasets.append(save_dataset("taylor_songs_features", df,
    "tidytuesday/2023-10-17/taylor_album_songs.csv",
    "Select audio feature columns, drop NaN.",
    "Audio features of Taylor Swift album tracks"))

# 9. Tornados — annual count by magnitude
df = pd.read_csv(TT_BASE / "2023/2023-05-16/tornados.csv")
agg = df.groupby(["yr","mag"]).size().reset_index(name="count")
agg = agg[(agg["mag"] >= 0) & (agg["yr"] >= 1980)]
agg.columns = ["year","magnitude","count"]
datasets.append(save_dataset("tornado_counts", agg,
    "tidytuesday/2023-05-16/tornados.csv",
    "Group by year and magnitude, count occurrences. Filter 1980+, valid magnitudes.",
    "US tornado counts by year and EF-scale magnitude"))

# 10. Centenarians — age at death by gender
df = pd.read_csv(TT_BASE / "2023/2023-05-30/centenarians.csv")
df = df[["rank","name","age","gender","place_of_death_or_residence","still_alive"]].copy()
datasets.append(save_dataset("centenarians", df,
    "tidytuesday/2023-05-30/centenarians.csv",
    "Select key demographic columns.",
    "World's oldest verified people"))

# 11. Global energy — top countries renewable share
df = pd.read_csv(TT_BASE / "2023/2023-06-06/owid-energy.csv")
df2 = df[df["year"] == 2021][["country","year","renewables_share_energy","fossil_share_energy","nuclear_share_energy","population"]].dropna()
df2 = df2[df2["population"] > 10_000_000].sort_values("renewables_share_energy", ascending=False).head(30)
datasets.append(save_dataset("energy_mix_2021", df2,
    "tidytuesday/2023-06-06/owid-energy.csv",
    "Filter to 2021, select energy share columns, top 30 countries by population>10M.",
    "Energy mix (renewable/fossil/nuclear share) for large countries in 2021"))

# 12. Energy trends over time for select countries
countries_sel = ["United States","China","Germany","India","Brazil","France","Japan","United Kingdom"]
df3 = df[df["country"].isin(countries_sel)][["country","year","renewables_share_energy","fossil_share_energy"]].dropna()
df3 = df3[df3["year"] >= 2000]
datasets.append(save_dataset("energy_trends", df3,
    "tidytuesday/2023-06-06/owid-energy.csv",
    "Filter to 8 major countries, 2000+, select renewable and fossil share.",
    "Renewable vs fossil energy share trends for 8 major countries"))

# 13. Global temperatures — annual
df = pd.read_csv(TT_BASE / "2023/2023-07-11/global_temps.csv")
df = df[["Year","J-D","D-N","DJF","MAM","JJA","SON"]].copy()
df.columns = ["year","annual","dec_nov","winter","spring","summer","fall"]
df = df.dropna(subset=["annual"])
datasets.append(save_dataset("global_temps", df,
    "tidytuesday/2023-07-11/global_temps.csv",
    "Select annual and seasonal anomaly columns, rename for clarity.",
    "NASA GISS global temperature anomalies by year and season"))

# 14. Hot Ones sauces — scoville by season
df = pd.read_csv(TT_BASE / "2023/2023-08-08/sauces.csv")
datasets.append(save_dataset("hot_ones_sauces", df,
    "tidytuesday/2023-08-08/sauces.csv",
    "Used as-is (already clean and small).",
    "Hot Ones sauce Scoville ratings by season and position"))

# 15. US states — basic demographics
df = pd.read_csv(TT_BASE / "2023/2023-08-01/states.csv")
df = df[["state","postal_abbreviation","capital_city","population_2020","total_area_mi2"]].copy()
df["pop_density"] = df["population_2020"] / df["total_area_mi2"]
df.columns = ["state","abbrev","capital","population","area_sq_mi","pop_density"]
datasets.append(save_dataset("us_states", df,
    "tidytuesday/2023-08-01/states.csv",
    "Select and rename demographic columns.",
    "US state population, area, and density"))

# 16. Union wages — trends
df = pd.read_csv(TT_BASE / "2023/2023-09-05/wages.csv")
df = df[["year","wage","at_cap","union_wage","nonunion_wage","union_wage_premium_raw"]].dropna()
datasets.append(save_dataset("union_wages", df,
    "tidytuesday/2023-09-05/wages.csv",
    "Select wage columns, drop NaN.",
    "US union vs non-union wages over time"))

# 17. Time use — global human day
df = pd.read_csv(TT_BASE / "2023/2023-09-12/global_human_day.csv")
datasets.append(save_dataset("global_human_day", df,
    "tidytuesday/2023-09-12/global_human_day.csv",
    "Used as-is.",
    "How humanity spends an average day (hours per activity)"))

# 18. Time use by country
df = pd.read_csv(TT_BASE / "2023/2023-09-12/all_countries.csv")
regions = pd.read_csv(TT_BASE / "2023/2023-09-12/country_regions.csv")
df2 = df.merge(regions[["country_iso3","country_name","region_name"]], left_on="country_iso3", right_on="country_iso3")
sleep = df2[df2["Subcategory"] == "Sleep & bedrest"][["country_name","region_name","hoursPerDayCombined"]].copy()
sleep.columns = ["country","region","sleep_hours"]
sleep = sleep.sort_values("sleep_hours", ascending=False)
datasets.append(save_dataset("sleep_by_country", sleep,
    "tidytuesday/2023-09-12/all_countries.csv + country_regions.csv",
    "Join with regions, filter to 'Sleep & bedrest' subcategory.",
    "Average daily sleep hours by country and region"))

# 19. Life expectancy trends
df = pd.read_csv(TT_BASE / "2023/2023-12-05/life_expectancy.csv")
sel = ["World","United States","China","India","Japan","Nigeria","Germany","Brazil"]
df2 = df[df["Entity"].isin(sel) & (df["Year"] >= 1950)]
df2.columns = ["country","code","year","life_expectancy"]
datasets.append(save_dataset("life_expectancy", df2,
    "tidytuesday/2023-12-05/life_expectancy.csv",
    "Filter to 8 countries, 1950+.",
    "Life expectancy trends for select countries since 1950"))

# 20. Holiday movies — rating distribution
df = pd.read_csv(TT_BASE / "2023/2023-12-12/holiday_movies.csv")
df = df[["primary_title","year","runtime_minutes","average_rating","num_votes","title_type"]].dropna()
df = df[df["num_votes"] >= 100]
datasets.append(save_dataset("holiday_movies", df,
    "tidytuesday/2023-12-12/holiday_movies.csv",
    "Select key columns, filter to movies with 100+ votes.",
    "Holiday movie ratings and runtime"))

# 21. Dr Who episodes — viewership
df = pd.read_csv(TT_BASE / "2023/2023-11-28/drwho_episodes.csv")
df = df[["era","season_number","episode_number","episode_title","uk_viewers"]].dropna()
datasets.append(save_dataset("drwho_episodes", df,
    "tidytuesday/2023-11-28/drwho_episodes.csv",
    "Select viewership columns, drop NaN.",
    "Doctor Who episode viewership and ratings"))

# 22. Squirrel census — activity by location
df = pd.read_csv(TT_BASE / "2023/2023-05-23/squirrel_data.csv")
df2 = df[["Primary Fur Color","Shift","Running","Chasing","Climbing","Eating","Foraging"]].dropna()
agg = df2.groupby(["Primary Fur Color","Shift"]).agg(
    count=("Running","size"),
    pct_running=("Running","mean"),
    pct_eating=("Eating","mean"),
    pct_foraging=("Foraging","mean")
).reset_index()
agg.columns = ["fur_color","shift","count","pct_running","pct_eating","pct_foraging"]
datasets.append(save_dataset("squirrel_activity", agg,
    "tidytuesday/2023-05-23/squirrel_data.csv",
    "Group by fur color and shift, compute activity rates.",
    "NYC Central Park squirrel activity rates by fur color and time of day"))

# 23. Canada births — monthly
df = pd.read_csv(TT_BASE / "2024/2024-01-09/canada_births_1991_2022.csv")
datasets.append(save_dataset("canada_births", df,
    "tidytuesday/2024-01-09/canada_births_1991_2022.csv",
    "Used as-is (already clean).",
    "Monthly births in Canada from 1991 to 2022"))

# 24. NHL player births — by country
df = pd.read_csv(TT_BASE / "2024/2024-01-09/nhl_player_births.csv")
agg = df.groupby("birth_country").size().reset_index(name="player_count").sort_values("player_count", ascending=False).head(20)
datasets.append(save_dataset("nhl_birth_countries", agg,
    "tidytuesday/2024-01-09/nhl_player_births.csv",
    "Count players by birth country, top 20.",
    "NHL players by birth country"))

# 25. NHL player births — by decade and country
df["birth_year"] = pd.to_datetime(df["birth_date"], errors="coerce").dt.year
df["decade"] = (df["birth_year"] // 10) * 10
top5 = df["birth_country"].value_counts().head(5).index.tolist()
agg = df[df["birth_country"].isin(top5)].groupby(["decade","birth_country"]).size().reset_index(name="count")
agg = agg[agg["decade"] >= 1960]
datasets.append(save_dataset("nhl_births_decade", agg,
    "tidytuesday/2024-01-09/nhl_player_births.csv",
    "Derive decade from birth year, count by decade+country for top 5 countries. 1960+.",
    "NHL player births by decade for top 5 countries"))

# 26. Trash Wheel — collection by type
df = pd.read_csv(TT_BASE / "2024/2024-03-05/trashwheel.csv")
df = df[["Name","Year","PlasticBottles","Polystyrene","CigaretteButts","SportsBalls","PlasticBags"]].dropna()
agg = df.groupby(["Name","Year"]).sum().reset_index()
datasets.append(save_dataset("trash_wheel", agg,
    "tidytuesday/2024-03-05/trashwheel.csv",
    "Select trash type columns, aggregate by name and year.",
    "Baltimore trash wheel collections by type and year"))

# 27. Groundhog predictions
df = pd.read_csv(TT_BASE / "2024/2024-01-30/predictions.csv")
ghogs = pd.read_csv(TT_BASE / "2024/2024-01-30/groundhogs.csv")
agg = df[df["shadow"].notna()].groupby(["id","shadow"]).size().reset_index(name="count")
agg = agg.merge(ghogs[["id","shortname","region"]], on="id")
datasets.append(save_dataset("groundhog_predictions", agg,
    "tidytuesday/2024-01-30 predictions + groundhogs",
    "Count shadow/no-shadow predictions per groundhog, join with names.",
    "Groundhog Day shadow predictions by groundhog"))

# 28. ISC R grants
df = pd.read_csv(TT_BASE / "2024/2024-02-20/isc_grants.csv")
df = df[["year","group","title","funded"]].copy()
datasets.append(save_dataset("r_grants", df,
    "tidytuesday/2024-02-20/isc_grants.csv",
    "Select key columns.",
    "R Consortium ISC grant funding"))

# 29. Spam classification features
df = pd.read_csv(TT_BASE / "2023/2023-08-15/spam.csv")
df = df.head(200)
datasets.append(save_dataset("spam_features", df,
    "tidytuesday/2023-08-15/spam.csv",
    "Take first 200 rows.",
    "Email spam classification features"))

# 30. Drugs approved by EU — by therapeutic area
df = pd.read_csv(TT_BASE / "2023/2023-03-14/drugs.csv")
df = df[df["authorisation_status"] == "authorised"]
agg = df.groupby("therapeutic_area").size().reset_index(name="count").sort_values("count", ascending=False).head(20)
agg = agg[agg["therapeutic_area"].str.len() < 60]
datasets.append(save_dataset("eu_drugs_by_area", agg,
    "tidytuesday/2023-03-14/drugs.csv",
    "Filter authorised drugs, count by therapeutic area, top 20.",
    "EU authorised drugs by therapeutic area"))

# 31. Programming languages — popularity by decade
df = pd.read_csv(TT_BASE / "2023/2023-03-21/languages.csv")
df = df[["title","type","appeared","number_of_users","github_language_repos"]].dropna()
df["decade"] = (df["appeared"].astype(int) // 10) * 10
agg = df[df["type"]=="pl"].groupby("decade").size().reset_index(name="new_languages")
agg = agg[agg["decade"] >= 1950]
datasets.append(save_dataset("prog_languages_decade", agg,
    "tidytuesday/2023-03-21/languages.csv",
    "Filter to programming languages, count new languages by decade. 1950+.",
    "New programming languages created per decade"))

# 32. Top programming languages
df2 = df[df["type"]=="pl"].sort_values("number_of_users", ascending=False).head(25)
df2 = df2[["title","appeared","number_of_users","github_language_repos"]].copy()
datasets.append(save_dataset("top_prog_languages", df2,
    "tidytuesday/2023-03-21/languages.csv",
    "Filter to PLs, sort by users, top 25.",
    "Top 25 programming languages by number of users"))

# 33. Artists in news — nationality distribution
df = pd.read_csv(TT_BASE / "2023/2023-01-17/artists.csv")
agg = df.groupby("artist_nationality").agg(count=("artist_name","count"), avg_space=("space_ratio_per_page_total","mean")).reset_index()
agg = agg.sort_values("count", ascending=False).head(15)
datasets.append(save_dataset("artists_nationality", agg,
    "tidytuesday/2023-01-17/artists.csv",
    "Group by nationality, count artists and avg space ratio. Top 15.",
    "Artists in art history textbooks by nationality"))

# 34. Survivalists — age and gender
df = pd.read_csv(TT_BASE / "2023/2023-01-24/survivalists.csv")
df = df[["season","name","age","gender","city","state","result","days_lasted","reason_tapped_out"]].copy()
datasets.append(save_dataset("survivalists", df,
    "tidytuesday/2023-01-24/survivalists.csv",
    "Select key columns.",
    "Alone TV show survivalists — demographics and performance"))

# 35. Fair use cases — by year and outcome
df = pd.read_csv(TT_BASE / "2023/2023-08-29/fair_use_cases.csv")
df = df[["case","year","court","outcome","categories"]].dropna()
datasets.append(save_dataset("fair_use_cases", df,
    "tidytuesday/2023-08-29/fair_use_cases.csv",
    "Select key columns, drop NaN.",
    "US fair use copyright cases and outcomes"))

# 36. Horror articles — ratings
df = pd.read_csv(TT_BASE / "2023/2023-10-31/horror_articles.csv")
df = df[["title","rating","author","claim"]].dropna()
datasets.append(save_dataset("horror_articles", df,
    "tidytuesday/2023-10-31/horror_articles.csv",
    "Select key columns, drop NaN.",
    "Snopes horror article ratings"))

# 37. Cats UK — movement stats
df = pd.read_csv(TT_BASE / "2023/2023-01-31/cats_uk_reference.csv")
df = df[["animal_id","animal_sex","hrs_indoors","n_cats","food_dry","food_wet","age_years"]].dropna()
datasets.append(save_dataset("cats_uk", df,
    "tidytuesday/2023-01-31/cats_uk_reference.csv",
    "Select demographic and behavior columns, drop NaN.",
    "UK pet cats — demographics and indoor hours"))

# 38. Refugee populations — top origins
df = pd.read_csv(TT_BASE / "2023/2023-08-22/population.csv")
df2022 = df[df["year"] == 2022].groupby("coo_name").agg(total_refugees=("refugees","sum")).reset_index()
df2022 = df2022.sort_values("total_refugees", ascending=False).head(20)
df2022.columns = ["country_of_origin","total_refugees"]
datasets.append(save_dataset("refugees_2022", df2022,
    "tidytuesday/2023-08-22/population.csv",
    "Filter to 2022, sum refugees by country of origin, top 20.",
    "Top 20 refugee-producing countries in 2022"))

# 39. Richmond AFC F-bomb counts
df = pd.read_csv(TT_BASE / "2023/2023-09-26/richmondway.csv")
df = df[["Season","Episode","F_count_RK","F_count_total","Dating_flag","Coaching_flag"]].copy()
datasets.append(save_dataset("richmond_fwords", df,
    "tidytuesday/2023-09-26/richmondway.csv",
    "Select relevant columns.",
    "Ted Lasso Roy Kent F-word counts by episode"))

# 40. Haunted places — by state
df = pd.read_csv(TT_BASE / "2023/2023-10-10/haunted_places.csv")
agg = df.groupby("state").size().reset_index(name="haunted_place_count").sort_values("haunted_place_count", ascending=False)
datasets.append(save_dataset("haunted_places_by_state", agg,
    "tidytuesday/2023-10-10/haunted_places.csv",
    "Count haunted places by US state.",
    "Number of reported haunted places by US state"))

# ── Vega Datasets ──────────────────────────────────────────────────────

# 41. Seattle Weather
df = pd.read_csv(VEGA_BASE / "seattle-weather.csv")
df["date"] = pd.to_datetime(df["date"])
df["month"] = df["date"].dt.month
df["year"] = df["date"].dt.year
monthly = df.groupby(["year","month"]).agg(
    avg_temp_max=("temp_max","mean"), avg_temp_min=("temp_min","mean"),
    total_precip=("precipitation","sum")
).reset_index()
monthly = monthly[monthly["year"] >= 2013]
datasets.append(save_dataset("seattle_weather_monthly", monthly,
    "vega-datasets/seattle-weather.csv",
    "Group by year+month, compute avg temps and total precip. 2013+.",
    "Seattle monthly weather averages"))

# 42. Seattle Weather daily (sample)
df2 = df[df["year"] == 2015][["date","precipitation","temp_max","temp_min","wind","weather"]].copy()
datasets.append(save_dataset("seattle_weather_2015", df2,
    "vega-datasets/seattle-weather.csv",
    "Filter to 2015, select key columns.",
    "Seattle daily weather in 2015"))

# 43. Stocks
df = pd.read_csv(VEGA_BASE / "stocks.csv")
df["date"] = pd.to_datetime(df["date"])
datasets.append(save_dataset("stocks", df,
    "vega-datasets/stocks.csv",
    "Parse dates, used as-is.",
    "Historical stock prices for major tech companies"))

# 44. Iowa Electricity
df = pd.read_csv(VEGA_BASE / "iowa-electricity.csv")
datasets.append(save_dataset("iowa_electricity", df,
    "vega-datasets/iowa-electricity.csv",
    "Used as-is.",
    "Iowa electricity generation by source over time"))

# 45. US Employment
df = pd.read_csv(VEGA_BASE / "us-employment.csv")
datasets.append(save_dataset("us_employment", df,
    "vega-datasets/us-employment.csv",
    "Used as-is.",
    "US employment by sector over time"))

# 46. Airports
df = pd.read_csv(VEGA_BASE / "airports.csv")
df = df[["iata","name","city","state","country","latitude","longitude"]].dropna()
df = df[df["country"] == "USA"]
state_counts = df.groupby("state").size().reset_index(name="airport_count").sort_values("airport_count", ascending=False)
datasets.append(save_dataset("us_airports_by_state", state_counts,
    "vega-datasets/airports.csv",
    "Filter US airports, count by state.",
    "Number of airports per US state"))

# 47. Seattle temperatures — monthly avg
df = pd.read_csv(VEGA_BASE / "seattle-temps.csv")
df["date"] = pd.to_datetime(df["date"])
df["month"] = df["date"].dt.month
df["year"] = df["date"].dt.year
monthly = df.groupby(["year","month"]).agg(avg_temp=("temp","mean"), min_temp=("temp","min"), max_temp=("temp","max")).reset_index()
datasets.append(save_dataset("seattle_temps_monthly", monthly,
    "vega-datasets/seattle-temps.csv",
    "Group by year+month, compute avg/min/max temp.",
    "Seattle monthly temperature statistics"))

# ── More TidyTuesday for diversity ────────────────────────────────────

# 48. Valentine's Day spending
df = pd.read_csv(TT_BASE / "2024/2024-02-13/historical_spending.csv", encoding="utf-8-sig")
datasets.append(save_dataset("valentines_spending", df,
    "tidytuesday/2024-02-13/historical_spending.csv",
    "Used as-is (already clean and small).",
    "Valentine's Day spending trends in the US"))

# 49. Notable deaths — by century
df = pd.read_csv(TT_BASE / "2024/2024-02-27/deaths.csv")
df = df[["year_death","person","description","year_birth"]].copy()
df["age_at_death"] = df["year_death"] - df["year_birth"]
datasets.append(save_dataset("notable_deaths_feb29", df,
    "tidytuesday/2024-02-27/deaths.csv",
    "Compute age at death.",
    "Notable people who died on February 29"))

# 50. R-Ladies chapters — growth
df = pd.read_csv(TT_BASE / "2023/2023-11-21/rladies_chapters.csv")
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["date"])
df["year"] = df["date"].dt.year
agg = df.groupby("year").size().reset_index(name="events")
datasets.append(save_dataset("rladies_events", agg,
    "tidytuesday/2023-11-21/rladies_chapters.csv",
    "Count events per year.",
    "R-Ladies chapter events per year"))

print(f"\n✅ Created {len(datasets)} datasets")
