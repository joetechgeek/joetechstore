"use client"

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useCartStore } from '../../store/useCartStore'
import { loadStripe } from '@stripe/stripe-js'
import { validateCoupon } from '../../utils/couponValidation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Session } from '@supabase/supabase-js'
import CheckoutButton from '../../components/CheckoutButton'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCartStore()
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number; couponOwnerId: string } | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
    }

    fetchSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    updateQuantity(productId, newQuantity)
  }

  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCouponError(null)
    if (!session) {
      setCouponError('Please log in to apply a coupon.')
      return
    }
    try {
      const result = await validateCoupon(couponCode, session.user.id)
      if (result.valid && result.code && result.discountAmount && result.couponOwnerId) {
        setAppliedCoupon({
          code: result.code,
          discountAmount: result.discountAmount,
          couponOwnerId: result.couponOwnerId
        })
        setCouponCode('')
      } else {
        setCouponError(result.message || 'Invalid coupon')
      }
    } catch (error) {
      console.error('Error applying coupon:', error)
      setCouponError('Failed to apply coupon. Please try again.')
    }
  }

  const total = appliedCoupon 
    ? subtotal() * (1 - appliedCoupon.discountAmount)
    : subtotal()

  const handleCheckout = async () => {
    setIsLoading(true)
    setCheckoutError(null)

    try {
      const response = await fetch('/api/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: items.map(item => ({
            price_data: {
              currency: 'usd',
              product_data: {
                name: item.product.name,
              },
              unit_amount: Math.round(item.product.price * 100),
            },
            quantity: item.quantity,
          })),
          couponCode: appliedCoupon?.code,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`HTTP error! status: ${response.status}. Details: ${errorText}`);
      }

      const { sessionUrl } = await response.json()
      
      if (!sessionUrl) {
        throw new Error('No session URL returned from the server');
      }

      // Redirect to Stripe Checkout
      window.location.href = sessionUrl;
    } catch (error: unknown) {
      console.error('Checkout error:', error)
      setCheckoutError(`An error occurred during checkout: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or contact support.`)
    } finally {
      setIsLoading(false)
    }
  }

  const removeCoupon = () => {
    setAppliedCoupon(null)
    setCouponError(null)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Your Cart</h1>
      {items.length === 0 ? (
        <p>Your cart is empty. Let&apos;s go shopping!</p>
      ) : (
        <>
          {items.map((item) => (
            <div key={item.product.id} className="flex items-center justify-between border-b py-4">
              <div className="flex-grow mr-4">
                <Link href={`/product/${item.product.id}`} className="text-xl font-semibold hover:text-blue-500">
                  {item.product.name}
                </Link>
                <p className="text-gray-600">${item.product.price.toFixed(2)} each</p>
              </div>
              <div className="flex items-center">
                <button
                  onClick={() => handleQuantityChange(item.product.id, item.quantity - 1)}
                  className="px-2 py-1 bg-gray-200 rounded-l"
                >
                  -
                </button>
                <span className="px-4 py-1 bg-gray-100">{item.quantity}</span>
                <button
                  onClick={() => handleQuantityChange(item.product.id, item.quantity + 1)}
                  className="px-2 py-1 bg-gray-200 rounded-r"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.product.id)}
                  className="ml-4 text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="mt-8">
            <form onSubmit={handleApplyCoupon}>
              <input
                type="text"
                placeholder="Coupon Code"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="p-2 border rounded"
              />
              <button
                type="submit"
                className="ml-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                Apply Coupon
              </button>
            </form>
            {couponError && <p className="text-red-500 mt-2">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-green-500 mt-2">Coupon applied: {appliedCoupon.code} (10% discount)</p>
            )}
            {appliedCoupon && (
              <p>Don&apos;t forget to check out our other products!</p>
            )}
            {appliedCoupon && (
              <p>We&apos;re always adding new items to our inventory.</p>
            )}
            {appliedCoupon && (
              <p>If you&apos;re not satisfied, we offer a 30-day money-back guarantee.</p>
            )}
            {appliedCoupon && (
              <p>{`You're saving $${(subtotal() * appliedCoupon.discountAmount).toFixed(2)}`}</p>
            )}
            {appliedCoupon && (
              <button
                onClick={removeCoupon}
                className="mt-2 text-red-500 hover:text-red-700"
              >
                Remove Coupon
              </button>
            )}
          </div>
          <div className="mt-8">
            <p className="text-2xl font-bold">Subtotal: ${subtotal().toFixed(2)}</p>
            {appliedCoupon && (
              <p className="text-xl text-green-600">
                Discount: ${(subtotal() * appliedCoupon.discountAmount).toFixed(2)}
              </p>
            )}
            <p className="text-2xl font-bold">Total: ${total.toFixed(2)}</p>
          </div>
          <CheckoutButton 
            items={items} 
            couponCode={appliedCoupon?.code} 
            discountAmount={appliedCoupon?.discountAmount}
          />
        </>
      )}
      <div className="mt-8">
        <Link href="/" className="text-blue-500 hover:underline">
          ← Continue Shopping
        </Link>
      </div>
    </div>
  )
}