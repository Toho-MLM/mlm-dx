import { createClient } from '@supabase/supabase-js'

// Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// 環境が開発の場合のみログイン関数を追加
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.loginDebug = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    })

    if (error) {
      console.error('ログインエラー:', error.message)
    } else {
      console.log('ログイン成功:', data.user)
    }
  }
}
