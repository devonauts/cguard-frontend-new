import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import AddressAutocomplete from "./maps/AddressAutocomplete";
import GoogleMapEmbed from "./GoogleMap/GoogleMapEmbed";

export default function EmpresaDireccionForm() {
  const { t } = useTranslation();
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);

  const handleSelectDireccion = (data: any) => {
    setDireccion(data.address);
    setLat(Number(data.latitude ?? data.lat ?? data.latitude));
    setLng(Number(data.longitude ?? data.lon ?? data.longitude));
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <label style={{ fontWeight: 600 }}>
        {t(
          "ui.EmpresaDireccionForm.direccionDeLaEmpresa",
          "Dirección de la Empresa*",
        )}
      </label>
      <AddressAutocomplete
        defaultValue={direccion}
        initialLat={lat}
        initialLng={lng}
        mapHeight="320px"
        placeholder={t(
          "ui.EmpresaDireccionForm.ejAntonioMiguelDeSoler",
          "Ej: Antonio Miguel de Soler N29-26 y Bartolomé de las Casas",
        )}
        showMap={true}
        onAddressSelect={handleSelectDireccion}
      />
      {/* Los dos campos iban con `width: 120` en línea y sin envoltorio: en un
          teléfono se salían de la tarjeta y la etiqueta quedaba pegada al
          campo anterior. Ahora se apilan y usan los estilos del sistema. */}
      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="cg-eyebrow mb-1.5 block" htmlFor="empresa-lat">
            {t("clients.stations.lat", "Latitud")}
          </label>
          <input
            className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
            id="empresa-lat"
            placeholder={t("clients.stations.lat", "Latitud")}
            type="number"
            value={lat ?? ""}
            onChange={(e) => setLat(Number(e.target.value))}
          />
        </div>
        <div className="min-w-0">
          <label className="cg-eyebrow mb-1.5 block" htmlFor="empresa-lng">
            {t("clients.stations.lng", "Longitud")}
          </label>
          <input
            className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
            id="empresa-lng"
            placeholder={t("clients.stations.lng", "Longitud")}
            type="number"
            value={lng ?? ""}
            onChange={(e) => setLng(Number(e.target.value))}
          />
        </div>
      </div>
      {lat && lng && (
        <GoogleMapEmbed
          draggable={false}
          height="320px"
          lat={lat}
          lng={lng}
          zoom={17}
        />
      )}
    </div>
  );
}
