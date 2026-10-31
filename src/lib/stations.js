// Stations of the dimension, in journey order.
// Path (experience & education) and Signal (GitHub) are designed but not built yet: they
// are added here together with their components, once verified data exists for them.
export function getStations() {
  const stations = [
    { id: 'home', label: 'Core', title: 'Core' },
    { id: 'origin', label: 'Origin', title: 'About' },
    { id: 'instruments', label: 'Instruments', title: 'Skills' },
    { id: 'works', label: 'Works', title: 'Work' },
    { id: 'contact', label: 'Transmission', title: 'Contact' },
  ];
  return stations.map((s, i) => ({ ...s, index: String(i + 1).padStart(2, '0') }));
}
