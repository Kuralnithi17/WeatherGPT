import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pointOnFeature } from '@turf/point-on-feature'

const sourceUrl = 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09592ced973a3448cf66b6100b741b64c0d/releaseData/gbOpen/IND/ADM2/geoBoundaries-IND-ADM2_simplified.geojson'
const districts = [
  ['Ariyalur', 'Ariyalur'],
  ['Chengalpattu', 'Chengalputtu'],
  ['Chennai', 'Chennai'],
  ['Coimbatore', 'Coimbatore'],
  ['Cuddalore', 'Cuddalore'],
  ['Dharmapuri', 'Dharmapuri'],
  ['Dindigul', 'Dindigul'],
  ['Erode', 'Erode'],
  ['Kallakurichi', 'Kallakurichi'],
  ['Kancheepuram', 'Kancheepuram'],
  ['Kanniyakumari', 'Kanniyakumari'],
  ['Karur', 'Karur'],
  ['Krishnagiri', 'Krishnagiri'],
  ['Madurai', 'Madurai'],
  ['Mayiladuthurai', 'Mayiladuthurai'],
  ['Nagapattinam', 'Nagapattinam'],
  ['Namakkal', 'Namakkal'],
  ['Nilgiris', 'The Nilgiris'],
  ['Perambalur', 'Perambalur'],
  ['Pudukkottai', 'Pudukkottai'],
  ['Ramanathapuram', 'Ramanathapuram'],
  ['Ranipet', 'Ranipet'],
  ['Salem', 'Salem'],
  ['Sivaganga', 'Sivaganga'],
  ['Tenkasi', 'Tenkasi'],
  ['Thanjavur', 'Thanjavur'],
  ['Theni', 'Theni'],
  ['Thoothukudi', 'Thoothukkudi'],
  ['Tiruchirappalli', 'Tiruchirappalli'],
  ['Tirunelveli', 'Tirunelveli'],
  ['Tirupathur', 'Tirupathur'],
  ['Tiruppur', 'Tiruppur'],
  ['Tiruvallur', 'Thiruvallur'],
  ['Tiruvannamalai', 'Tiruvannamalai'],
  ['Tiruvarur', 'Thiruvarur'],
  ['Vellore', 'Vellore'],
  ['Viluppuram', 'Viluppuram'],
  ['Virudhunagar', 'Virudhunagar'],
]

const response = await fetch(sourceUrl)
if (!response.ok) throw new Error(`Boundary source returned ${response.status}`)
const source = await response.json()

const features = districts.map(([districtName, sourceName]) => {
  const feature = source.features.find((item) => item.properties.shapeName === sourceName)
  if (!feature) throw new Error(`Missing district boundary: ${districtName} (${sourceName})`)
  const weatherPoint = pointOnFeature(feature).geometry.coordinates
  return {
    ...feature,
    properties: { ...feature.properties, districtName, weatherPoint },
  }
})

if (features.length !== 38 || new Set(features.map((feature) => feature.properties.districtName)).size !== 38) {
  throw new Error(`Expected 38 unique district features, received ${features.length}`)
}

const output = {
  type: 'FeatureCollection',
  name: 'Tamil Nadu district boundaries',
  source: {
    name: 'geoBoundaries',
    boundaryId: 'IND-ADM2-76128533',
    boundaryYearRepresented: '2021',
    sourceDataUpdateDate: '2023-01-19',
    buildDate: '2023-12-12',
    license: 'Open Data Commons Open Database License 1.0',
    sourceUrl,
  },
  features,
}

const outputPath = resolve(import.meta.dirname, '../../backend/data/tamil-nadu-districts.geojson')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(output))
console.log(`Wrote ${features.length} district boundaries to ${outputPath}`)
