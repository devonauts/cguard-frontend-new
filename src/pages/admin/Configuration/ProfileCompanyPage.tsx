import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SettingsPageShell from './components/SettingsPageShell'
import ProfileCompanyForm from './components/ProfileCompanyForm'

const ProfileCompany = () => {
  const { t } = useTranslation()
  return (
    <SettingsPageShell
      icon={<Building2 />}
      title={t('settings.configuracion.perfil-empresa', 'Perfil de la empresa')}
      subtitle="Los datos con los que tu empresa aparece en informes, correos y documentos."
    >
      <ProfileCompanyForm />
    </SettingsPageShell>
  )
}

export default ProfileCompany
