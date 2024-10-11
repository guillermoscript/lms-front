'use client'
import { motion } from 'framer-motion'
import { Award, Book, ChevronRight, Rocket, Users } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function NoCourseOrSubAlert() {
    const [activeTab, setActiveTab] = useState('subscription')
    const t = useScopedI18n('NoCourseOrSubAlert')

    const features = [
        {
            icon: <Rocket className="h-6 w-6" />,
            title: t('accessAllCourses'),
            description: t('unlimitedAccess'),
        },
        {
            icon: <Book className="h-6 w-6" />,
            title: t('exclusiveContent'),
            description: t('premiumMaterials'),
        },
        {
            icon: <Users className="h-6 w-6" />,
            title: t('communitySupport'),
            description: t('vibrantCommunity'),
        },
        {
            icon: <Award className="h-6 w-6" />,
            title: t('certificates'),
            description: t('earnCertificates'),
        },
    ]

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                <motion.h1
                    className="text-4xl md:text-5xl font-bold text-center mb-6"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {t('unlockLearningJourney')}
                </motion.h1>
                <motion.p
                    className="text-xl text-center mb-12 "
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                >
                    {t('embarkExperience')}
                </motion.p>

                <Tabs
                    defaultValue={activeTab}
                    className="mb-12"
                    onValueChange={setActiveTab}
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="subscription">
                            {t('subscriptionPlans')}
                        </TabsTrigger>
                        <TabsTrigger value="individual">
                            {t('individualCourses')}
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="subscription">
                        <Card>
                            <CardContent className="p-6">
                                <h2 className="text-2xl font-semibold mb-4">
                                    {t('unlimitedLearning')}
                                </h2>
                                <p className="mb-6">
                                    {t('subscriptionDescription')}
                                </p>
                                <Link
                                    href="/plans"
                                    className={buttonVariants({
                                        variant: 'default',
                                    })}
                                >
                                    {t('viewSubscriptionPlans')}{' '}
                                    <ChevronRight className="ml-2 h-4 w-4" />
                                </Link>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="individual">
                        <Card>
                            <CardContent className="p-6">
                                <h2 className="text-2xl font-semibold mb-4">
                                    {t('learnAtYourOwnPace')}
                                </h2>
                                <p className="mb-6 ">
                                    {t('individualDescription')}
                                </p>
                                <Link
                                    href="/store"
                                    className={buttonVariants({
                                        variant: 'secondary',
                                    })}
                                >
                                    {t('browseIndividualCourses')}{' '}
                                    <ChevronRight className="ml-2 h-4 w-4" />
                                </Link>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            className="flex items-start space-x-4"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 * index, duration: 0.5 }}
                        >
                            <div className="bg-purple-600 p-3 rounded-full">
                                {feature.icon}
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">
                                    {feature.title}
                                </h3>
                                <p>
                                    {feature.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    )
}
