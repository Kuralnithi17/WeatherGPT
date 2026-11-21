import { useEffect } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPinned } from 'lucide-react'

function DistrictMapBounds({ data }) {
  const map = useMap()
  useEffect(() => {
    const bounds = L.geoJSON(data).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [12, 12] })
  }, [data, map])
  return null
}

function DistrictLocator({ data, selected, onSelect, loading, error }) {
  const style = (feature) => {
    const active = feature.properties.districtName === selected
    return {
      color: active ? '#f0c77e' : '#77b9d8',
      weight: active ? 2.5 : 1,
      fillColor: active ? '#d29e4a' : '#3987aa',
      fillOpacity: active ? 0.62 : 0.29,
    }
  }
  const onEachFeature = (feature, layer) => {
    const name = feature.properties.districtName
    layer.bindTooltip(name, { sticky: true, className: 'district-map-tooltip' })
    layer.on({ click: () => onSelect(name) })
  }

  return <article className="panel locator-panel"><div className="panel-heading"><div><p className="card-kicker">DISTRICT BOUNDARIES</p><h3>Across Tamil Nadu</h3></div><MapPinned size={16} className="locator-icon" /></div>
    {data ? <MapContainer className="district-map" center={[11, 78]} zoom={6} minZoom={5} maxZoom={11} scrollWheelZoom zoomControl>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; <a href=&quot;https://www.openstreetmap.org/copyright&quot; target=&quot;_blank&quot; rel=&quot;noreferrer&quot;>OpenStreetMap contributors</a>" />
      <DistrictMapBounds data={data} />
      <GeoJSON key={selected} data={data} style={style} onEachFeature={onEachFeature} />
    </MapContainer> : <div className="map-message" role={error ? 'alert' : 'status'}>{error || (loading ? <><span className="loading-ring" /> Loading district boundaries…</> : 'District boundaries are unavailable.')}</div>}
    <p className="locator-caption">Click a district to load live weather · Hover for district name · Drag to pan, scroll or use controls to zoom</p>
  </article>
}

export default DistrictLocator
