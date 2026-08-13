import { UserRound } from 'lucide-react'
import SettingsPageShell from './components/SettingsPageShell'
import ProfileUserForm from './components/ProfileUserForm';

const ProfileUser = () => {
  return (
    <SettingsPageShell
      icon={<UserRound />}
      title="Perfil del usuario"
      subtitle="Tu foto, tus datos de contacto y el idioma con el que ves la plataforma."
    >
      <ProfileUserForm />
    </SettingsPageShell>
  )
}

export default ProfileUser
