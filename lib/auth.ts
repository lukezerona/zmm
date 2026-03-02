import bcrypt from 'bcryptjs'
import { supabase } from './supabase'

export interface User {
  id: string
  username: string
  password: string
  created_at: string
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return await bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword)
}

export async function registerUser(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if username already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single()

    if (existingUser) {
      return { success: false, error: 'Username already exists' }
    }

    // Hash the password
    const hashedPassword = await hashPassword(password)

    // Create the user
    const { data, error } = await supabase
      .from('users')
      .insert([
        { username, password: hashedPassword }
      ])
      .select()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Registration failed' }
  }
}

export async function loginUser(username: string, password: string): Promise<{ success: boolean; error?: string; user?: User }> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !user) {
      return { success: false, error: 'Invalid username or password' }
    }

    const isValidPassword = await verifyPassword(password, user.password)

    if (!isValidPassword) {
      return { success: false, error: 'Invalid username or password' }
    }

    return { success: true, user }
  } catch (error) {
    return { success: false, error: 'Login failed' }
  }
}
