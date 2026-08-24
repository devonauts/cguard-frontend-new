import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AddressAutocomplete from './maps/AddressAutocomplete';
import GoogleMapEmbed from './GoogleMap/GoogleMapEmbed';

export default function EmpresaDireccionForm() {
  const { t } = useTranslation();
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);

  const handleSelectDireccion = (data: any) => {
    setDireccion(data.address);
    setLat(Number(data.latitude ?? data.lat ?? data.latitude));
    setLng(Number(data.longitude ?? data.lon ?? data.longitude));
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <label style={{ fontWeight: 600 }}>{t("ui.EmpresaDireccionForm.direccionDeLaEmpresa", "Dirección de la Empresa*")}</label>
      <AddressAutocomplete
        defaultValue={direccion}
        initialLat={lat}
        initialLng={lng}
        placeholder={t("ui.EmpresaDireccionForm.ejAntonioMiguelDeSoler", "Ej: Antonio Miguel de Soler N29-26 y Bartolomé de las Casas")}
        onAddressSelect={handleSelectDireccion}
        showMap={true}
        mapHeight="320px"
      />
      <div style={{ margin: '16px 0' }}>
        <label>Latitud</label>
        <input
          type="number"
          value={lat ?? ''}
          onChange={e => setLat(Number(e.target.value))}
          placeholder="Latitud"
          style={{ width: 120, marginRight: 8 }}
        />
        <label>Longitud</label>
        <input
          type="number"
          value={lng ?? ''}
          onChange={e => setLng(Number(e.target.value))}
          placeholder="Longitud"
          style={{ width: 120 }}
        />
      </div>
      {lat && lng && (
        <GoogleMapEmbed
          lat={lat}
          lng={lng}
          zoom={17}
          height="320px"
          draggable={false}
        />
      )}
    </div>
  );
}
