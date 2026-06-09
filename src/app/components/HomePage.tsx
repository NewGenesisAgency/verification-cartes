'use client';

import { Link } from 'next-view-transitions';
import { CreditCard } from 'lucide-react';
import { useRevealer } from '../hooks/useRevealer';

export default function HomePage() {
    useRevealer();
    const applications = [
        {
            id: 1,
            name: 'Vérification des Cartes',
            description: 'Vérification et validation des cartes étudiantes',
            icon: CreditCard,
            href: '/verification-cartes',
            available: true
        }
    ];

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <header className="border-b border-gray-200">
                <div className="container mx-auto px-6 py-6">
                    <h1 className="text-3xl font-bold text-black">
                        Lycée Edouard Branly - MDL
                    </h1>
                    <p className="text-gray-600 mt-2">
                        Maison des Lycéens - Applications et Services
                    </p>
                </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto px-6 py-12 flex-grow">
                <div className="mb-8">
                    <h2 className="text-2xl font-semibold text-black mb-2">
                        Applications disponibles
                    </h2>
                    <p className="text-gray-600">
                        Sélectionnez une application pour commencer
                    </p>
                </div>

                {/* Applications Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {applications.map((app) => {
                        const Icon = app.icon;
                        return (
                            <Link
                                key={app.id}
                                href={app.href}
                                className={`
                                    block p-8 bg-white border-2 border-black rounded-3xl
                                    transition-all duration-300 hover:shadow-xl hover:scale-105
                                    ${app.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
                                `}
                            >
                                <div className="flex flex-col items-center text-center space-y-4">
                                    <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center">
                                        <Icon className="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-black mb-2">
                                            {app.name}
                                        </h3>
                                        <p className="text-gray-600 text-sm">
                                            {app.description}
                                        </p>
                                    </div>
                                    {app.available && (
                                        <span className="inline-block px-4 py-2 bg-black text-white text-sm font-medium rounded-full">
                                            Accéder
                                        </span>
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </div>

            </main>

            {/* Footer Credits */}
            <footer className="container mx-auto px-6 pb-8">
                <div className="text-left" style={{ fontFamily: 'Afacad Flux, sans-serif' }}>
                    <div className="text-[11px] text-black uppercase tracking-wide">
                        Application réalisée par
                    </div>
                    <a 
                        href="https://newgenesis.ai" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="group relative inline-block text-[13px] text-black font-semibold uppercase tracking-wider mt-0.5 transition-colors duration-500 hover:text-gray-500"
                        style={{ fontFamily: 'Afacad Flux, sans-serif' }}
                    >
                        NEWGENESIS
                        <span className="absolute left-0 bottom-0 w-full h-[2px] bg-black transition-transform duration-500 scale-x-0 origin-right group-hover:scale-x-100 group-hover:origin-left" />
                    </a>
                </div>
            </footer>
        </div>
    );
}