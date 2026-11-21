# 🌦️ WeatherGPT – Intelligent Weather Forecasting & Decision Support Platform

**WeatherGPT** is an intelligent weather information and decision-support platform that combines real-time weather data, historical weather analysis, machine learning, and AI-powered assistance to help users understand weather conditions and make informed decisions.

The platform is designed to go beyond traditional weather applications by providing localized weather insights, historical trends, forecast analysis, official weather warnings, and conversational weather assistance.

---

## 📌 Project Overview

Traditional weather applications primarily display current weather conditions and forecasts. However, users often need more than temperature and rainfall information.

WeatherGPT aims to address this by integrating multiple weather data sources, historical analysis, machine learning techniques, and AI-powered explanations into a unified platform.

The system is designed to provide:

- Real-time weather information.
- District-wise weather forecasts.
- Historical weather data and trend analysis.
- Machine learning-based weather prediction.
- Official weather alerts and warnings.
- AI-powered conversational weather assistance.
- Interactive dashboards for weather monitoring.

---

## 🎯 Project Objectives

1. Provide accessible and localized weather information.
2. Analyze historical weather patterns to identify trends.
3. Explore machine learning techniques for weather prediction.
4. Integrate official weather warnings for better awareness.
5. Provide AI-powered explanations through natural language interaction.
6. Present weather information through an interactive and user-friendly dashboard.

---

## ✨ Key Features

### 1. Real-Time Weather Monitoring
- Retrieve weather information using weather data APIs.
- Display temperature, humidity, rainfall, wind speed, and other weather parameters.
- Support location-based and district-wise weather information.

### 2. Weather Forecasting
- Present upcoming weather conditions.
- Provide forecast information for selected locations.
- Display important weather parameters through visual representations.

### 3. Historical Weather Analytics
- Retrieve historical weather information.
- Analyze temperature and rainfall patterns.
- Store historical weather records in PostgreSQL.
- Visualize weather trends through interactive charts.

### 4. Machine Learning-Based Prediction
- Explore machine learning models for weather forecasting.
- Analyze historical weather observations.
- Generate experimental predictions using trained models.
- Compare model predictions with available weather information.

*Note: Machine learning forecasts are experimental and require further validation before being treated as operational weather forecasts.*

### 5. Official Alerts & Warnings
- Integrate district-wise weather warning information from the India Meteorological Department (IMD).
- Retrieve warning information through the IMD district-wise warning service.
- Present warning severity, affected districts, valid dates, and recommended precautions.

### 6. AI Weather Assistant
- Provide a conversational interface for weather-related queries.
- Generate understandable explanations of weather conditions.
- Support hosted AI integration through OpenAI.
- Support local AI integration through Ollama.
- Provide a built-in fallback response mechanism when external AI services are unavailable.

### 7. Interactive Dashboard
- Centralized weather monitoring interface.
- Weather statistics and visualizations.
- Navigation between weather, analytics, alerts, and assistant sections.
- Responsive frontend design.

---

## 🏗️ System Architecture

WeatherGPT follows a frontend-backend architecture.

```text
                 USER
                   |
                   v
        REACT FRONTEND (VITE)
                   |
                   v
             FASTAPI BACKEND
                   |
        +----------+----------+
        |          |          |
        v          v          v
   WEATHER APIs  ML MODELS  AI SERVICES
        |          |          |
        v          v          v
  OPEN-METEO    PREDICTION  OPENAI / OLLAMA
        |
        v
  HISTORICAL WEATHER
        |
        v
     POSTGRESQL

        IMD WARNING SERVICE
                 |
                 v
          FASTAPI BACKEND
                 |
                 v
           REACT FRONTEND
```

### Application Workflow

1. The user interacts with the React frontend.
2. The frontend sends requests to the FastAPI backend.
3. The backend retrieves weather information from external sources.
4. Historical information is stored and retrieved using PostgreSQL.
5. Machine learning components process weather data for experimental predictions.
6. AI services generate conversational responses.
7. The backend returns processed information to the frontend for visualization.

---

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | React.js, JavaScript, Vite |
| Styling | Tailwind CSS, CSS |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| Weather Data | Open-Meteo |
| Historical Data | Open-Meteo Historical Weather / ERA5 |
| Machine Learning | Python, Scikit-learn (where used by the prediction modules) |
| AI Integration | OpenAI API, Ollama |
| Official Weather Warnings | India Meteorological Department (IMD) |
| API Communication | REST APIs |
| Development Tools | VS Code, Git, GitHub, Docker |

---

## 📂 Project Structure

The project is organized into separate frontend and backend modules.

```text
WeatherGPT/
│
├── backend/
│   ├── main.py
│   ├── alert_sources.py
│   ├── history_store.py
│   ├── requirements.txt
│   ├── ...
│   │
│   └── venv/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

*The structure above is representative. Additional files and modules may be present as development progresses. The virtual environment and `node_modules` should not be committed to GitHub.*

---

## ⚙️ Installation and Setup

Follow these steps to run WeatherGPT locally.

### Prerequisites

Install the following tools:

- Python 3.11 or later
- Node.js and npm
- PostgreSQL 17 (or Docker Desktop)
- Git
- VS Code (recommended)

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
```

Navigate into the project:

```bash
cd WeatherGPT
```

### 2. Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the environment on Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

If the PostgreSQL driver is not included in your requirements:

```bash
pip install "psycopg[binary]"
```

### 3. Database Setup

WeatherGPT uses PostgreSQL for historical weather data persistence.

If Docker Compose is configured for the project, start the database service from the project root:

```bash
docker compose up -d db
```

Verify the database container:

```bash
docker compose ps
```

Configure the database connection using the environment variables expected by the backend.

### 4. Environment Configuration

Create the required environment configuration using the project's expected variable names.

Example configuration:

```env
OPENAI_API_KEY=your_openai_api_key

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=your_local_model_name

# Configure database connection
# using the variable names expected by the backend.
```

**Important:**
- Replace placeholder values with your own configuration.
- Do not upload `.env` files or API keys to GitHub.
- Keep database credentials private.
- Install and start Ollama separately if using local AI.

### 5. Start the Backend

From the backend directory:

```bash
uvicorn main:app --reload
```

The FastAPI server runs at:

```text
http://127.0.0.1:8000
```

Interactive API documentation:

```text
http://127.0.0.1:8000/docs
```

### 6. Frontend Setup

Open another terminal:

```bash
cd frontend
```

Install frontend dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```

---

## 🔗 API Integration

WeatherGPT communicates with its backend through REST API endpoints.

The Vite development server is configured to forward frontend `/api` requests to the FastAPI backend.

Example request:

```javascript
fetch('/api/alerts/official?day=5')
```

The proxy removes the `/api` prefix before forwarding the request to FastAPI.

The backend includes functionality for:

- Weather information retrieval.
- Historical weather data.
- Weather comparisons.
- District boundary information.
- AI assistant interactions.
- Official IMD weather warnings.

For the complete endpoint list and request parameters, refer to the FastAPI documentation at `/docs` after starting the backend.

---

## 🌐 Data Sources

| Data Source | Purpose |
|---|---|
| Open-Meteo | Weather information and forecasts |
| Open-Meteo Historical Weather / ERA5 | Historical weather observations and analysis |
| India Meteorological Department | Official district-wise weather warnings |
| OpenAI | Hosted AI-powered assistance |
| Ollama | Local AI model integration |

Data availability and coverage depend on the respective source and API.

---

## 🔮 Future Enhancements

The following improvements are planned for future development:

- Improve machine learning model accuracy and validation.
- Add more advanced weather prediction techniques.
- Enhance district-wise weather alert visualization.
- Expand official weather data integration.
- Improve multilingual conversational support.
- Add personalized weather recommendations.
- Introduce agricultural weather insights.
- Improve dashboard responsiveness and accessibility.
- Deploy the application using cloud infrastructure.
- Add automated monitoring and notifications for severe weather conditions.

---

## 🔐 Security Considerations

- Store API keys and database credentials in environment variables.
- Exclude sensitive configuration files from version control.
- Validate user inputs before processing API requests.
- Handle external API failures gracefully.
- Use secure configurations when deploying the application.

---

## 👩‍💻 Development Status

**WeatherGPT is an actively developed project.**

The application brings together weather data retrieval, historical analytics, AI integration, and experimental machine learning into one platform.

Some components may require further testing, integration, and validation before production deployment.

---

## 👤 Author

**Kuralnithi K.**

B.Tech – Information Technology

Interested in Machine Learning, Data Analytics, and Full Stack Development.

---

## 📄 License

This project is developed for educational and academic purposes.

A formal open-source license can be added to the repository if the project is intended for public reuse.

---

⭐ If you find this project interesting, consider giving the repository a star!

**WeatherGPT – Making Weather Information More Intelligent, Understandable, and Useful.**
