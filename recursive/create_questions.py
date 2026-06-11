#!/usr/bin/env python3
"""
Generate visualization questions for each dataset.
Each question targets a specific chart type and difficulty level.
"""
import json
from pathlib import Path

OUT = Path("/home/chenwang/flint-chart/recursive/questions")

# (dataset_name, question, target_chart_type, difficulty)
# difficulty: "basic" = straightforward, "moderate" = needs some thought, "advanced" = multi-encoding/facets
QUESTIONS = [
    # ── Bar Charts ────────────────────────────────────────────────────────
    ("bob_ross_elements", "Show the most common painting elements in Bob Ross episodes as a bar chart.", "Bar Chart", "basic"),
    ("nhl_birth_countries", "Create a bar chart showing how many NHL players were born in each country.", "Bar Chart", "basic"),
    ("eu_drugs_by_area", "Visualize the number of EU-authorised drugs by therapeutic area.", "Bar Chart", "basic"),
    ("haunted_places_by_state", "Which US states have the most reported haunted places? Show as a bar chart.", "Bar Chart", "basic"),
    ("us_airports_by_state", "Compare the number of airports across US states.", "Bar Chart", "basic"),
    ("refugees_2022", "Show the top refugee-producing countries in 2022.", "Bar Chart", "basic"),
    ("rladies_events", "Show the number of R-Ladies events per year.", "Bar Chart", "basic"),

    # ── Stacked / Grouped Bars ────────────────────────────────────────────
    ("nhl_births_decade", "Show NHL player birth counts by decade, with bars colored by country.", "Stacked Bar Chart", "moderate"),
    ("squirrel_activity", "Compare squirrel activity rates (running, eating, foraging) by fur color using grouped bars.", "Grouped Bar Chart", "moderate"),
    ("trash_wheel", "Show total plastic bottles collected by each trash wheel per year as stacked bars.", "Stacked Bar Chart", "moderate"),
    ("iowa_electricity", "Show Iowa electricity generation by source over time as a stacked bar chart.", "Stacked Bar Chart", "moderate"),

    # ── Line Charts ───────────────────────────────────────────────────────
    ("tech_stocks_monthly", "Plot the monthly average closing price for each tech company over time.", "Line Chart", "moderate"),
    ("life_expectancy", "Show how life expectancy has changed since 1950 for different countries.", "Line Chart", "moderate"),
    ("energy_trends", "Plot the trend of renewable energy share over time for major countries.", "Line Chart", "moderate"),
    ("global_temps", "Show the annual global temperature anomaly trend over time.", "Line Chart", "basic"),
    ("union_wages", "Plot union vs non-union wages over time as two lines.", "Line Chart", "moderate"),
    ("london_marathon", "Show how the number of marathon finishers has changed over the years.", "Line Chart", "basic"),
    ("stocks", "Plot stock prices over time for different companies.", "Line Chart", "moderate"),
    ("drwho_episodes", "Show Doctor Who UK viewership trends across episodes.", "Line Chart", "basic"),

    # ── Area Charts ───────────────────────────────────────────────────────
    ("egg_production", "Show egg production trends over time by production type as a stacked area chart.", "Area Chart", "moderate"),
    ("canada_births", "Show monthly birth trends in Canada over time as an area chart.", "Area Chart", "basic"),

    # ── Scatter Plots ─────────────────────────────────────────────────────
    ("taylor_songs_features", "Create a scatter plot of danceability vs energy for Taylor Swift songs, colored by album.", "Scatter Plot", "moderate"),
    ("movie_age_gaps", "Plot age difference vs release year for movie couples.", "Scatter Plot", "basic"),
    ("holiday_movies", "Create a scatter plot of movie rating vs number of votes for holiday movies.", "Scatter Plot", "basic"),
    ("cats_uk", "Plot hours spent indoors vs age for UK cats, colored by sex.", "Scatter Plot", "moderate"),
    ("us_states", "Create a scatter plot of state population vs area.", "Scatter Plot", "basic"),
    ("spam_features", "Plot the 'dollar' feature vs 'bang' feature for spam classification, colored by spam label.", "Scatter Plot", "moderate"),
    ("survivalists", "Plot age vs days lasted for Alone survivalists, colored by gender.", "Scatter Plot", "moderate"),
    ("top_prog_languages", "Scatter plot of year appeared vs number of users for top programming languages.", "Scatter Plot", "moderate"),

    # ── Heatmap ───────────────────────────────────────────────────────────
    ("seattle_temps_monthly", "Create a heatmap of average temperature by month and year for Seattle.", "Heatmap", "moderate"),
    ("tornado_counts", "Show tornado counts as a heatmap with year on one axis and magnitude on the other.", "Heatmap", "moderate"),
    ("richmond_fwords", "Create a heatmap of F-word counts by season and episode.", "Heatmap", "moderate"),

    # ── Pie / Donut ───────────────────────────────────────────────────────
    ("global_human_day", "Show how humanity spends an average day as a pie chart.", "Pie Chart", "basic"),
    ("energy_mix_2021", "Show the energy mix (renewable, fossil, nuclear) for a single country as a pie chart.", "Pie Chart", "basic"),

    # ── Histogram ─────────────────────────────────────────────────────────
    ("movie_age_gaps", "Show the distribution of age differences in movie couples as a histogram.", "Histogram", "basic"),
    ("survivalists", "Show the distribution of days lasted by Alone contestants.", "Histogram", "basic"),
    ("taylor_songs_features", "Show the distribution of song tempos across Taylor Swift's catalog.", "Histogram", "basic"),

    # ── Boxplot ───────────────────────────────────────────────────────────
    ("hot_ones_sauces", "Show the distribution of Scoville ratings by sauce position (1-10) as box plots.", "Boxplot", "moderate"),
    ("taylor_songs_features", "Compare the distribution of valence scores across Taylor Swift albums using box plots.", "Boxplot", "moderate"),

    # ── Faceted Charts ────────────────────────────────────────────────────
    ("energy_mix_2021", "Create a bar chart of renewable energy share by country, faceted by whether fossil share is above or below 50%.", "Bar Chart", "advanced"),
    ("soccer_results", "Show the distribution of home goals, faceted by match result (H/D/A).", "Histogram", "advanced"),
    ("seattle_weather_2015", "Show daily temperature range by weather type, one panel per weather category.", "Line Chart", "advanced"),

    # ── Lollipop ──────────────────────────────────────────────────────────
    ("artists_nationality", "Show artist count by nationality as a lollipop chart.", "Lollipop Chart", "moderate"),
    ("prog_languages_decade", "Show new programming languages per decade as a lollipop chart.", "Lollipop Chart", "basic"),

    # ── Waterfall ─────────────────────────────────────────────────────────
    ("valentines_spending", "Show how Valentine's Day per-person spending changed year over year as a waterfall chart.", "Waterfall Chart", "advanced"),

    # ── High-level / open-ended questions ─────────────────────────────────
    ("tech_stocks_monthly", "What's the best way to compare tech stock performance in 2022?", "Line Chart", "basic"),
    ("global_temps", "Visualize the relationship between seasonal and annual temperature anomalies.", "Scatter Plot", "moderate"),
    ("seattle_weather_2015", "What weather patterns can you show from this Seattle weather data?", "Bar Chart", "basic"),
    ("sleep_by_country", "Visualize which regions of the world sleep the most.", "Bar Chart", "moderate"),
    ("groundhog_predictions", "Show whether groundhogs tend to predict more shadow or no-shadow.", "Stacked Bar Chart", "moderate"),
    ("notable_deaths_feb29", "Visualize the ages at death of notable people who died on February 29.", "Bar Chart", "basic"),
    ("r_grants", "Show R Consortium ISC grant funding amounts over time.", "Bar Chart", "moderate"),
    ("fair_use_cases", "Visualize the outcomes of US fair use cases over time.", "Stacked Bar Chart", "moderate"),
    ("us_employment", "Show employment trends across major sectors over time.", "Line Chart", "moderate"),
    ("taylor_albums", "Compare Taylor Swift album ratings visually.", "Bar Chart", "basic"),
]

# Save as JSON
questions_out = []
for i, (dataset, question, chart_type, difficulty) in enumerate(QUESTIONS):
    questions_out.append({
        "id": f"q{i:03d}",
        "dataset": dataset,
        "question": question,
        "expected_chart_type": chart_type,
        "difficulty": difficulty,
    })

with open(OUT / "questions.json", "w") as f:
    json.dump(questions_out, f, indent=2)

# Summary stats
from collections import Counter
ct = Counter(q[2] for q in QUESTIONS)
diff = Counter(q[3] for q in QUESTIONS)
print(f"Total questions: {len(QUESTIONS)}")
print(f"\nBy chart type:")
for k, v in ct.most_common():
    print(f"  {k}: {v}")
print(f"\nBy difficulty:")
for k, v in diff.most_common():
    print(f"  {k}: {v}")
