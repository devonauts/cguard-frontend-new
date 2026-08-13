import { Building2 } from 'lucide-react'
import SettingsPageShell from './components/SettingsPageShell'
import ProfileCompanyForm from './components/ProfileCompanyForm'

const ProfileCompany = () => {
  return (
    <SettingsPageShell
      icon={<Building2 />}
      title="Perfil de la empresa"
      subtitle="Los datos con los que tu empresa aparece en informes, correos y documentos."
    >
      <ProfileCompanyForm />
    </SettingsPageShell>
  )
}

export default ProfileCompany
